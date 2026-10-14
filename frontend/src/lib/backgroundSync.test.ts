import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Entry, GatewayAdapter } from './types';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
let store: typeof import('./store.svelte')['store'];
let adapter: GatewayAdapter;
let server: Entry[];
const payload = { date: '2026-10-11', tag: 'Dining', description: 'Lunch', direction: 'O' as const, amount: 10 };
beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem('ms_connection', JSON.stringify({ gasUrl: 'https://background.example', apiSecret: 'test' }));
  vi.resetModules();
  server = [{ ...payload, id: 1, row: 3, mainCategory: 'FOOD' }];
  adapter = {
    getEntries: vi.fn(async () => server.map(entry => ({ ...entry }))),
    getMaster: vi.fn(async () => ({ onHand: 100, budgets: { FOOD: 100 } })),
    getCategories: async () => ({ FOOD: ['Dining'] }),
    getConfig: async () => ({ currency: '₱' }),
    getStats: async () => ({ categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] }),
    addEntry: vi.fn(), addEntries: vi.fn(), updateEntry: vi.fn(), deleteEntry: vi.fn(), validateConnection: vi.fn(),
  };
  (await import('./api')).setAdapter(adapter);
  store = (await import('./store.svelte')).store;
  await store.refreshAll();
});
afterEach(() => { store?.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('accepts a new save durably before delivery and refuses admission without storage', async () => {
  const request = deferred<Entry>();
  adapter.addEntry = vi.fn(() => request.promise);
  const submission = store.submitAddEntry(payload);
  expect(submission.accepted).toBe(true);
  expect(store.entries.find(entry => entry.id < 0)?.description).toBe('Lunch');
  expect((await import('./queue')).readQueue()).toHaveLength(1);
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Full'); });
  const refused = store.submitAddEntry({ ...payload, description: 'Keep draft' });
  expect(refused.accepted).toBe(false);
  expect(await refused.completion).toBe(false);
  expect(store.entries.some(entry => entry.description === 'Keep draft')).toBe(false);
  expect(adapter.addEntry).toHaveBeenCalledOnce();
  storage.mockRestore();
  server.push({ ...payload, id: 2, row: 4, mainCategory: 'FOOD' });
  request.resolve(server[1]);
  await submission.completion;
});

it('publishes core data and unlocks a confirmed entry without waiting for optional reads', async () => {
  const optional = deferred<Awaited<ReturnType<GatewayAdapter['getStats']>>>();
  adapter.getStats = () => optional.promise;
  adapter.updateEntry = async (id, patch) => { server = server.map(entry => entry.id === id ? { ...entry, ...patch } : entry); };
  const edit = store.submitUpdateEntry(1, { amount: 25 });
  await vi.waitFor(() => expect(store.busyIds.has(1)).toBe(false));
  await edit.completion;
  expect(store.entries[0].amount).toBe(25);
  expect(store.loading).toBe(false);
  expect(store.statsStale).toBe(true);
  optional.resolve({ categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] });
  await vi.waitFor(() => expect(store.statsStale).toBe(false));
});

it('keeps edits, deletes and bulk selection unaccepted when local storage refuses them', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Full'); });
  for (const submission of [store.submitUpdateEntry(1, { amount: 99 }), store.submitDeleteEntry(1), store.submitDeleteEntries([1])]) {
    expect(submission.accepted).toBe(false);
    expect(await submission.completion).toBe(false);
  }
  expect(store.entries[0].amount).toBe(10);
  expect(adapter.updateEntry).not.toHaveBeenCalled();
  expect(adapter.deleteEntry).not.toHaveBeenCalled();
});

it('shows one notice at five seconds, carries its age into reconciliation and preserves a newer error', async () => {
  vi.useFakeTimers();
  const write = deferred<Entry>();
  const read = deferred<Entry[]>();
  adapter.addEntry = () => write.promise;
  const submission = store.submitAddEntry(payload);
  const { toast } = await import('./toast.svelte');
  await vi.advanceTimersByTimeAsync(4_999);
  expect(toast.msg).toBeNull();
  await vi.advanceTimersByTimeAsync(1);
  expect(toast.msg).toBe('Taking longer than usual. Your changes are saved on this device.');
  adapter.getEntries = () => read.promise;
  const confirmed = { ...payload, id: 2, row: 4, mainCategory: 'FOOD' };
  write.resolve(confirmed);
  await vi.advanceTimersByTimeAsync(0);
  expect(toast.msg).toBe('Changes saved. Balances are still updating.');
  toast.show('Another operation was rejected', undefined, 'destructive');
  read.resolve([...server, confirmed]);
  await submission.completion;
  expect(toast.msg).toBe('Another operation was rejected');
});

it('automatically drains a burst queued behind an active save, preserving keys and closing the episode', async () => {
  const first = deferred<Entry>();
  let calls = 0;
  const keys: string[] = [];
  adapter.addEntry = vi.fn(async (saved, key) => {
    keys.push(key!);
    if (++calls === 1) return first.promise;
    const entry = { ...saved, id: calls + 1, row: calls + 3, mainCategory: 'FOOD' };
    server.push(entry);
    return entry;
  });
  const one = store.submitAddEntry(payload);
  const two = store.submitAddEntry({ ...payload, description: 'Second' });
  await two.completion;
  expect(adapter.addEntry).toHaveBeenCalledOnce();
  const queued = (await import('./queue')).readQueue();
  const confirmed = { ...payload, id: 2, row: 4, mainCategory: 'FOOD' };
  server.push(confirmed);
  first.resolve(confirmed);
  await one.completion;
  await vi.waitFor(() => expect(store.localIds.size).toBe(0));
  await vi.waitFor(() => expect(store.balancesStale).toBe(false));
  expect(keys).toEqual(queued.map(item => item.op === 'add' ? item.mutationId : ''));
  expect(store.entries.map(entry => entry.description)).toEqual(['Lunch', 'Lunch', 'Second']);
});

it('warm reload overlays queued intent on a confirmed baseline and automatically resumes online work', async () => {
  const { writeCache } = await import('./cache');
  writeCache({ entries: server, master: store.master, categories: store.categories });
  const { queueFor } = await import('./queue');
  queueFor().restoreQueueForRecovery([{ op: 'edit', id: 1, patch: { amount: 77 } }]);
  store.dispose();
  vi.resetModules();
  const write = deferred<void>();
  const read = deferred<Entry[]>();
  adapter.updateEntry = vi.fn(async (id, patch) => {
    await write.promise;
    server = server.map(entry => entry.id === id ? { ...entry, ...patch } : entry);
  });
  adapter.getEntries = () => read.promise;
  (await import('./api')).setAdapter(adapter);
  store = (await import('./store.svelte')).store;
  await store.init();
  expect(store.entries[0].amount).toBe(77);
  expect(store.loading).toBe(false);
  expect(store.master.onHand).toBe(100);
  expect(adapter.updateEntry).toHaveBeenCalledOnce();
  write.resolve();
  read.resolve(server);
  adapter.getEntries = async () => server;
  await vi.waitFor(() => expect(store.balancesStale).toBe(false));
  const baseline = (await import('./cache')).readCache()!;
  expect(baseline.entries[0].amount).toBe(77);
});

it('removes definitively rejected replay intent and restores the confirmed baseline across reload', async () => {
  const { ConnectionError } = await import('./api');
  adapter.updateEntry = async () => { throw new ConnectionError('Offline'); };
  await store.updateEntry(1, { amount: 77 });
  await store.refreshAll(true);
  expect((await import('./cache')).readCache()!.entries[0].amount).toBe(10);
  adapter.updateEntry = async () => { throw new Error('Tag rejected'); };
  await store.drainQueue();
  expect(store.entries[0].amount).toBe(10);
  expect((await import('./queue')).readQueue()).toEqual([]);
  store.dispose();
  vi.resetModules();
  (await import('./api')).setAdapter(adapter);
  store = (await import('./store.svelte')).store;
  await store.init();
  expect(store.entries[0].amount).toBe(10);
});

it.each([1_000, 4_900])('finishes a %ims operation without a routine toast', async duration => {
  vi.useFakeTimers();
  adapter.updateEntry = async (id, patch) => {
    await new Promise(resolve => setTimeout(resolve, duration));
    server = server.map(entry => entry.id === id ? { ...entry, ...patch } : entry);
  };
  const started = performance.now();
  const submission = store.submitUpdateEntry(1, { amount: 42 });
  expect(submission.accepted).toBe(true);
  expect(performance.now() - started).toBeLessThan(100);
  expect(store.entries[0].amount).toBe(42);
  await vi.advanceTimersByTimeAsync(duration);
  await submission.completion;
  expect((await import('./toast.svelte')).toast.msg).toBeNull();
});

it('does not repeat an expired/dismissed notice during overlapping operations or internal reads', async () => {
  vi.useFakeTimers();
  const first = deferred<Entry>();
  adapter.addEntry = () => first.promise;
  store.submitAddEntry(payload);
  const { toast } = await import('./toast.svelte');
  await vi.advanceTimersByTimeAsync(5_000);
  expect(toast.msg).not.toBeNull();
  toast.dismiss();
  store.submitAddEntry({ ...payload, description: 'Second' });
  await store.refreshAll(true);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(toast.msg).toBeNull();
  expect(store.syncDelayed).toBe(true);
});

it('retains a warm snapshot on read failure and cancels its delayed notice on teardown', async () => {
  vi.useFakeTimers();
  const { ConnectionError } = await import('./api');
  adapter.getEntries = async () => { throw new ConnectionError('Offline'); };
  const baseline = store.entries;
  await store.refreshAll();
  expect(store.entries).toEqual(baseline);
  expect(store.error).toBeNull();
  expect(store.loading).toBe(false);
  const { toast } = await import('./toast.svelte');
  expect(toast.msg).toBeNull();
  await vi.advanceTimersByTimeAsync(5_000);
  expect(toast.msg).toBe('Waiting to refresh. Showing your last update.');
  expect(toast.action?.label).toBe('Retry');
  store.dispose();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(toast.msg).toBeNull();
});

it('publishes each replay acknowledgment while a later queued request is still unresolved', async () => {
  const { ConnectionError } = await import('./api');
  adapter.addEntry = async () => { throw new ConnectionError('Offline'); };
  await store.addEntry({ ...payload, description: 'First queued' });
  await store.addEntry({ ...payload, description: 'Second queued' });
  const second = deferred<Entry>();
  const confirmed = { ...payload, id: 2, row: 4, mainCategory: 'FOOD', description: 'First queued' };
  adapter.addEntry = async saved => {
    if (saved.description === 'Second queued') return second.promise;
    server.push(confirmed);
    return confirmed;
  };
  const replay = store.drainQueue();
  await vi.waitFor(() => expect(store.entries.some(entry => entry.id === 2)).toBe(true));
  expect(store.busyIds.has(2)).toBe(false);
  expect(store.localIds.has(2)).toBe(false);
  server.push({ ...confirmed, id: 3, row: 5, description: 'Second queued' });
  second.resolve(server.at(-1)!);
  await replay;
});

it('does not let a bulk delete bypass an older failed edit of the same Entry', async () => {
  const { ConnectionError } = await import('./api');
  adapter.updateEntry = async () => { throw new ConnectionError('Offline'); };
  await store.updateEntry(1, { amount: 77 });
  adapter.deleteEntry = vi.fn(async () => {});
  const deletion = store.submitDeleteEntries([1]);
  expect(deletion.accepted).toBe(true);
  await deletion.completion;
  expect(adapter.deleteEntry).not.toHaveBeenCalled();
  expect((await import('./queue')).readQueue()).toEqual([{ op: 'delete', id: 1 }]);
});

it('allows a later same-entry edit after acknowledgment and preserves it through an older read and rollback', async () => {
  const oldRead = deferred<Entry[]>();
  adapter.getEntries = vi.fn().mockImplementationOnce(() => oldRead.promise).mockImplementation(async () => server);
  adapter.updateEntry = async (id, patch) => { server = server.map(entry => entry.id === id ? { ...entry, ...patch } : entry); };
  const first = store.submitUpdateEntry(1, { amount: 25 });
  await vi.waitFor(() => expect(store.busyIds.has(1)).toBe(false));
  adapter.updateEntry = async () => { throw new Error('Second edit rejected'); };
  const second = store.submitUpdateEntry(1, { amount: 99 });
  expect(second.accepted).toBe(true);
  expect(await second.completion).toBe(false);
  expect(store.entries[0].amount).toBe(25);
  oldRead.resolve([{ ...server[0], amount: 10 }]);
  await first.completion;
  expect(store.entries[0].amount).toBe(25);
  expect(store.balancesStale).toBe(false);
  expect(adapter.getEntries).toHaveBeenCalledTimes(2);
});

it('restores an acknowledged edit after reload before its balance reconciliation has completed', async () => {
  const read = deferred<Entry[]>();
  adapter.getEntries = () => read.promise;
  adapter.updateEntry = async (id, patch) => { server = server.map(entry => entry.id === id ? { ...entry, ...patch } : entry); };
  const submission = store.submitUpdateEntry(1, { amount: 25 });
  await vi.waitFor(() => expect(store.busyIds.has(1)).toBe(false));
  expect((await import('./queue')).readQueue()).toEqual([]);
  store.dispose();
  vi.resetModules();
  (await import('./api')).setAdapter(adapter);
  store = (await import('./store.svelte')).store;
  await store.init();
  expect(store.entries[0].amount).toBe(25);
  expect(store.balancesStale).toBe(true);
  expect(store.busyIds.has(1)).toBe(false);
  read.resolve(server);
  await submission.completion;
  await vi.waitFor(() => expect(store.balancesStale).toBe(false));
});

it.each(['add', 'delete'] as const)('retains an acknowledged %s through warm reload before reconciliation', async action => {
  const read = deferred<Entry[]>();
  adapter.getEntries = () => read.promise;
  adapter.addEntry = async saved => {
    const entry = { ...saved, id: 2, row: 4, mainCategory: 'FOOD' };
    server.push(entry);
    return entry;
  };
  adapter.deleteEntry = async id => { server = server.filter(entry => entry.id !== id); };
  const submission = action === 'add' ? store.submitAddEntry({ ...payload, description: 'Acknowledged new save' }) : store.submitDeleteEntry(1);
  await vi.waitFor(() => expect((action === 'add' ? store.entries.some(entry => entry.id === 2) : store.busyIds.has(1) === false)).toBe(true));
  store.dispose();
  vi.resetModules();
  (await import('./api')).setAdapter(adapter);
  store = (await import('./store.svelte')).store;
  await store.init();
  expect(store.entries.map(entry => entry.id)).toEqual(action === 'add' ? [1, 2] : []);
  expect(store.balancesStale).toBe(true);
  read.resolve(server);
  await submission.completion;
  await vi.waitFor(() => expect(store.balancesStale).toBe(false));
});

it('a rejected replay restores the last acknowledged edit rather than an older core snapshot', async () => {
  const read = deferred<Entry[]>();
  adapter.getEntries = () => read.promise;
  adapter.updateEntry = async (id, patch) => { server = server.map(entry => entry.id === id ? { ...entry, ...patch } : entry); };
  const first = store.submitUpdateEntry(1, { amount: 25 });
  await vi.waitFor(() => expect(store.busyIds.has(1)).toBe(false));
  const { ConnectionError } = await import('./api');
  adapter.updateEntry = async () => { throw new ConnectionError('Offline'); };
  await store.updateEntry(1, { amount: 99 });
  adapter.updateEntry = async () => { throw new Error('Rejected'); };
  await store.drainQueue();
  expect(store.entries[0].amount).toBe(25);
  const cache = (await import('./cache')).readCache()!;
  expect(cache.entries[0].amount).toBe(10);
  expect(cache.acknowledged?.entries[0].amount).toBe(25);
  expect(store.balancesStale).toBe(true);
  read.resolve(server);
  await first.completion;
});

it('discards an optional read invalidated by a rejected write without keeping a sync episode alive', async () => {
  const optional = deferred<Awaited<ReturnType<GatewayAdapter['getStats']>>>();
  adapter.getStats = () => optional.promise;
  await store.refreshAll(true);
  adapter.updateEntry = async () => { throw new Error('Rejected'); };
  await store.updateEntry(1, { amount: 99 });
  optional.resolve({ categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] });
  await vi.waitFor(() => expect(store.statisticsAwaitingSync).toBe(false));
  expect(store.syncDelayed).toBe(false);
});
