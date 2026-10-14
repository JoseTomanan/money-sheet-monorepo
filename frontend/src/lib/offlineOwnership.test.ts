import { scopedKey } from './financialScope';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { drain, submitAdd, submitEdit, submitDelete, submitAddBatch } from './offlineMutation';
import { enqueue, readQueue, restoreQueueForRecovery } from './queue';
import { ConnectionError } from './adapter-real';
import type { AddEntryPayload, Entry, UpdateEntryPatch } from './types';

const payload: AddEntryPayload = { date: '2026-01-01', tag: 'FOOD', description: 'save', direction: 'I', amount: 1 };
const entry: Entry = { ...payload, id: 42, mainCategory: 'FOOD' };
const offline = () => Promise.reject(new ConnectionError('timeout'));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => { resolve = r; });
  return { promise, resolve };
}
const callbacks = () => ({
  add: vi.fn(async (_payload: AddEntryPayload, _mutationId: string) => entry),
  addEntries: vi.fn(async (_payloads: AddEntryPayload[], _mutationId: string) => [entry, { ...entry, id: 43 }]),
  edit: vi.fn(async (_id: number, _patch: UpdateEntryPatch) => {}),
  delete: vi.fn(async (_id: number) => {}),
});

describe('Offline Queue ownership through caller interfaces', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('ms_connection', JSON.stringify({ gasUrl: 'https://unit.example', apiSecret: 'test' }));
  });
  afterEach(() => vi.restoreAllMocks());

  it('retains and delivers a save enqueued during awaited replay in order', async () => {
    await submitAdd(-1, payload, 'save-a', offline);
    const pending = deferred<Entry>();
    const api = callbacks();
    api.add.mockImplementationOnce(() => pending.promise);
    const replay = drain(api);
    enqueue({ op: 'add', tempId: -2, payload: { ...payload, amount: 2 }, mutationId: 'save-b' });
    pending.resolve(entry);
    expect((await replay).map(r => r.item)).toHaveLength(2);
    expect(api.add.mock.calls).toEqual([[payload, 'save-a'], [{ ...payload, amount: 2 }, 'save-b']]);
    expect(readQueue()).toEqual([]);
  });

  it('keeps a later confirmed-entry edit separate from the edit already in flight', async () => {
    await submitEdit(42, { amount: 2 }, offline);
    const pending = deferred<void>();
    const api = callbacks();
    api.edit.mockImplementationOnce(() => pending.promise);
    const replay = drain(api);
    const directDelivery = vi.fn(async () => {});
    expect((await submitEdit(42, { amount: 3 }, directDelivery)).status).toBe('queued');
    pending.resolve();
    await replay;
    expect(directDelivery).not.toHaveBeenCalled();
    expect(api.edit.mock.calls).toEqual([[42, { amount: 2 }], [42, { amount: 3 }]]);
    expect(readQueue()).toEqual([]);
  });

  it('prevents overlapping replay callers from delivering the same save twice', async () => {
    await submitAdd(-1, payload, 'save-a', offline);
    const pending = deferred<Entry>();
    const api = callbacks();
    api.add.mockImplementationOnce(() => pending.promise);
    const first = drain(api);
    const second = drain(api);
    pending.resolve(entry);
    expect(await first).toHaveLength(1);
    expect(await second).toEqual([]);
    expect(api.add).toHaveBeenCalledTimes(1);
  });

  it('reports failed persistence instead of acknowledging a durable queued save', async () => {
    const storageError = new Error('disk full');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw storageError; });
    const outcome = await submitAdd(-1, payload, 'save-a', offline);
    expect(outcome.status).toBe('failed');
    expect(outcome).toMatchObject({ error: expect.any(Error) });
    expect(readQueue()).toEqual([]);
  });

  it.each(['single', 'batch'] as const)('rejects direct edit/delete of frozen %s saves without delivery or queue changes', async kind => {
    if (kind === 'single') await submitAdd(-1, payload, 'frozen', offline);
    else await submitAddBatch([-1, -2], [payload, { ...payload, amount: 2 }], 'frozen', offline);
    const before = readQueue();
    const deliver = vi.fn(async () => {});
    for (const id of kind === 'single' ? [-1] : [-1, -2]) {
      expect((await submitEdit(id, { amount: 99 }, deliver)).status).toBe('failed');
      expect((await submitDelete(id, deliver)).status).toBe('failed');
      expect(() => enqueue({ op: 'edit', id, patch: { amount: 99 } })).toThrow();
      expect(() => enqueue({ op: 'delete', id })).toThrow();
    }
    expect(deliver).not.toHaveBeenCalled();
    expect(readQueue()).toEqual(before);
  });

  it('does not overwrite unreadable pending work or treat it as an empty queue', async () => {
    localStorage.setItem(scopedKey('ms_queue'), '{broken');
    expect(() => readQueue()).toThrow();
    expect((await submitAdd(-1, payload, 'save-a', offline)).status).toBe('failed');
    expect(localStorage.getItem(scopedKey('ms_queue'))).toBe('{broken');
  });

  it('persists the immutable save before first delivery so storage failure cannot strand an ambiguous commit', async () => {
    const deliver = vi.fn(async () => entry);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('disk full'); });
    expect((await submitAdd(-1, payload, 'save-a', deliver)).status).toBe('failed');
    expect(deliver).not.toHaveBeenCalled();
  });

  it('stops legacy replay without delivery when its Mutation ID cannot be persisted', async () => {
    restoreQueueForRecovery([{ op: 'add', tempId: -1, payload }]);
    const api = callbacks();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('disk full'); });
    const results = await drain(api);
    expect(results).toMatchObject([{ status: 'stopped', error: expect.any(Error) }]);
    expect(api.add).not.toHaveBeenCalled();
    expect(readQueue()).toEqual([{ op: 'add', tempId: -1, payload }]);
  });

  it('blocks administrative queue replacement while a save is being delivered', async () => {
    await submitAdd(-1, payload, 'save-a', offline);
    const pending = deferred<Entry>();
    const api = callbacks();
    api.add.mockImplementationOnce(() => pending.promise);
    const replay = drain(api);
    let replacementError: unknown;
    try { restoreQueueForRecovery([]); } catch (error) { replacementError = error; }
    pending.resolve(entry);
    await replay;
    expect(replacementError).toBeInstanceOf(Error);
    expect(api.add).toHaveBeenCalledOnce();
  });

  it.each(['single', 'batch'] as const)('reuses %s payload and Mutation ID after timeout, reload, and failed replay', async kind => {
    const attempts: { payloads: AddEntryPayload[]; mutationId: string }[] = [];
    const send = async (payloads: AddEntryPayload[], mutationId: string) => {
      attempts.push({ payloads, mutationId });
      throw new ConnectionError('ambiguous timeout');
    };
    if (kind === 'single') await submitAdd(-1, payload, (p, key) => send([p], key));
    else await submitAddBatch([-1, -2], [payload, { ...payload, amount: 2 }], send);
    const original = readQueue();
    vi.resetModules();
    const restored = await import('./offlineMutation');
    const api = callbacks();
    api.add.mockImplementation((p, key) => send([p], key));
    api.addEntries.mockImplementation(send);
    expect((await restored.drain(api))[0].status).toBe('stopped');
    expect(readQueue()).toEqual(original);
    const delivered = await restored.drain(callbacks());
    expect(delivered[0].status).toBe('drained');
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toEqual(attempts[1]);
    expect(attempts[0].mutationId).not.toBe('');
    expect(await restored.submitEdit(42, { amount: 99 }, async () => {})).toEqual({ status: 'confirmed' });
    expect(await restored.submitDelete(43, async () => {})).toEqual({ status: 'confirmed' });
  });

  it('reports failed removal after successful replay and retains the original retry identity', async () => {
    await submitAdd(-1, payload, 'save-a', offline);
    const api = callbacks();
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('disk full'); });
    expect((await drain(api))[0]).toMatchObject({ status: 'stopped', error: expect.any(Error) });
    expect(readQueue()).toMatchObject([{ mutationId: 'save-a', payload }]);
    storage.mockRestore();
    await drain(api);
    expect(api.add.mock.calls).toEqual([[payload, 'save-a'], [payload, 'save-a']]);
    expect(readQueue()).toEqual([]);
  });

  it('does not let replay consume a save during its initial delivery', async () => {
    const pending = deferred<Entry>();
    const api = callbacks();
    const first = submitAdd(-1, payload, 'save-a', () => pending.promise);
    expect((await submitAdd(-2, { ...payload, amount: 2 }, 'save-b', api.add)).status).toBe('queued');
    expect(await drain(api)).toEqual([]);
    pending.resolve(entry);
    expect((await first).status).toBe('confirmed');
    expect(readQueue()).toMatchObject([{ tempId: -2, mutationId: 'save-b' }]);
    await drain(api);
    expect(api.add.mock.calls).toEqual([[{ ...payload, amount: 2 }, 'save-b']]);
  });

  it('retains a delete queued while an earlier edit is awaiting delivery', async () => {
    await submitEdit(42, { amount: 2 }, offline);
    const pending = deferred<void>();
    const api = callbacks();
    api.edit.mockImplementationOnce(() => pending.promise);
    const replay = drain(api);
    expect((await submitDelete(42, api.delete)).status).toBe('queued');
    pending.resolve();
    expect((await replay).map(r => r.item.op)).toEqual(['edit', 'delete']);
    expect(api.delete).toHaveBeenCalledExactlyOnceWith(42);
  });

  it('rejects reuse of a pending temporary ID instead of appending a changed new save', async () => {
    await submitAdd(-1, payload, 'original', offline);
    const before = readQueue();
    expect((await submitAdd(-1, { ...payload, amount: 99 }, 'replacement', offline)).status).toBe('failed');
    expect(readQueue()).toEqual(before);
  });

  it.each(['single', 'batch', 'edit', 'delete'] as const)('reports storage read failure on %s submission without delivery', async kind => {
    const deliver = vi.fn(offline);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage unavailable'); });
    const outcome = kind === 'single' ? await submitAdd(-1, payload, deliver)
      : kind === 'batch' ? await submitAddBatch([-1, -2], [payload, payload], deliver)
      : kind === 'edit' ? await submitEdit(42, { amount: 2 }, deliver)
      : await submitDelete(42, deliver);
    expect(outcome).toMatchObject({ status: 'failed', error: expect.any(Error) });
    expect(deliver).not.toHaveBeenCalled();
    expect(() => readQueue()).toThrow('pending saves');
  });

  it.each(['single', 'batch', 'edit', 'delete'] as const)('reports storage write failure on %s submission without delivery', async kind => {
    const deliver = vi.fn(offline);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage unavailable'); });
    const outcome = kind === 'single' ? await submitAdd(-1, payload, deliver)
      : kind === 'batch' ? await submitAddBatch([-1, -2], [payload, payload], deliver)
      : kind === 'edit' ? await submitEdit(42, { amount: 2 }, deliver)
      : await submitDelete(42, deliver);
    expect(outcome).toMatchObject({ status: 'failed', error: expect.any(Error) });
    expect(deliver).not.toHaveBeenCalled();
    expect(readQueue()).toEqual([]);
  });

  it.each([0, 42])('rejects a new save with nonnegative temporary ID %s', async tempId => {
    const deliver = vi.fn(async () => entry);
    expect((await submitAdd(tempId, payload, deliver)).status).toBe('failed');
    expect(deliver).not.toHaveBeenCalled();
    expect(readQueue()).toEqual([]);
  });

  it('settles unrelated online edits independently without removing another in-flight item', async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const editingFirst = submitEdit(42, { amount: 2 }, () => first.promise);
    const sendSecond = vi.fn(() => second.promise);
    const editingSecond = submitEdit(43, { amount: 3 }, sendSecond);
    expect(sendSecond).toHaveBeenCalledOnce();
    second.resolve();
    expect((await editingSecond).status).toBe('confirmed');
    expect(readQueue()).toEqual([{ op: 'edit', id: 42, patch: { amount: 2 } }]);
    first.resolve();
    expect((await editingFirst).status).toBe('confirmed');
    expect(readQueue()).toEqual([]);
  });
});
