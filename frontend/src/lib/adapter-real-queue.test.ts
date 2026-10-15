import { afterEach, expect, it, vi } from 'vitest';
import { RealAdapter } from './adapter-real';
import { queueFor } from './queue';
import type { QueueItem } from './queue';

const payload = { date: '2026-01-01', tag: 'FOOD', description: 'saved intent', direction: 'I' as const, amount: 10 };
const entry = { ...payload, id: 7, mainCategory: 'FOOD' };
let scope = 0;
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

it.each([{}, null, { ok: true }, { ok: false, code: 'internal', message: 'failed after writing' },
  { ok: false, code: 'auth', message: 'secret rejected' },
])('retains original save and Mutation ID through ambiguous delivery and replay: %j', async reply => {
  const owner = queueFor(`https://queue-${++scope}.example`);
  const adapter = new RealAdapter(() => ({ gasUrl: 'https://sheet.example', apiSecret: 'secret' }));
  const fetchMock = vi.fn().mockImplementation(async () => ({ text: async () => JSON.stringify(reply) }));
  vi.stubGlobal('fetch', fetchMock);
  const deliver = adapter.addEntry.bind(adapter);
  expect((await owner.submitAdd(-1, payload, 'original-mutation-id', deliver)).status).toBe('queued');
  const original = owner.readQueue();
  expect(original).toEqual([{ op: 'add', tempId: -1, payload, mutationId: 'original-mutation-id' }]);
  const callbacks = { add: deliver, addEntries: adapter.addEntries.bind(adapter),
    edit: adapter.updateEntry.bind(adapter), delete: adapter.deleteEntry.bind(adapter) };
  expect((await owner.drain(callbacks))[0].status).toBe('stopped');
  expect(owner.readQueue()).toEqual(original);
  fetchMock.mockImplementation(async () => ({ text: async () => JSON.stringify({ ok: true, entry }) }));
  expect((await owner.drain(callbacks))[0]).toMatchObject({ status: 'drained', entry });
  expect(owner.readQueue()).toEqual([]);
  expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init.body)))).toEqual(
    Array(3).fill({ action: 'addEntry', ...payload, mutationId: 'original-mutation-id', secret: 'secret' }));
});

it.each([
  { op: 'addBatch', tempIds: [-1, -2], payloads: [payload, { ...payload, amount: -10 }], mutationId: 'batch-original' },
  { op: 'edit', id: 7, patch: { amount: 2 } },
  { op: 'delete', id: 7 },
] satisfies QueueItem[])('retains ambiguous pending $op through replay', async item => {
  const owner = queueFor(`https://queue-${++scope}.example`);
  const adapter = new RealAdapter(() => ({ gasUrl: 'https://sheet.example', apiSecret: 'secret' }));
  vi.stubGlobal('fetch', vi.fn(async () => ({ text: async () => '{}' })));
  owner.enqueue(item);
  const callbacks = { add: adapter.addEntry.bind(adapter), addEntries: adapter.addEntries.bind(adapter),
    edit: adapter.updateEntry.bind(adapter), delete: adapter.deleteEntry.bind(adapter) };
  expect((await owner.drain(callbacks))[0].status).toBe('stopped');
  expect(owner.readQueue()).toEqual([item]);
});

it.each(['validation', 'not_found'])('removes a definitively rejected item on replay: %s', async code => {
  const owner = queueFor(`https://queue-${++scope}.example`);
  const adapter = new RealAdapter(() => ({ gasUrl: 'https://sheet.example', apiSecret: 'secret' }));
  vi.stubGlobal('fetch', vi.fn(async () => ({ text: async () => JSON.stringify({ ok: false, code, message: 'rejected' }) })));
  owner.enqueue({ op: 'edit', id: 7, patch: { amount: 2 } });
  const result = await owner.drain({ add: adapter.addEntry.bind(adapter), addEntries: adapter.addEntries.bind(adapter),
    edit: adapter.updateEntry.bind(adapter), delete: adapter.deleteEntry.bind(adapter) });
  expect(result[0].status).toBe('rejected');
  expect(owner.readQueue()).toEqual([]);
});
