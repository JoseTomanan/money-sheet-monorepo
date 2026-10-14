import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry, GatewayAdapter } from './types';

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('optimistic Entries reconciliation', () => {
  let store: typeof import('./store.svelte')['store'];
  let api: typeof import('./api');
  let server: Entry[];
  let adapter: GatewayAdapter;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('ms_connection', JSON.stringify({ gasUrl: 'https://optimistic.example', apiSecret: 'test' }));
    vi.resetModules();
    api = await import('./api');
    server = [1, 2, 3].map(id => ({
      id, row: id + 2, date: '2026-10-11', tag: 'Dining', mainCategory: 'FOOD',
      description: `Entry ${id}`, direction: 'O', amount: id * 10,
    }));
    adapter = {
      getEntries: async () => server.map(entry => ({ ...entry })),
      getMaster: async () => ({ onHand: 100, budgets: { FOOD: 100 } }),
      getCategories: async () => ({ FOOD: ['Dining'] }),
      getConfig: async () => ({ currency: '₱' }),
      getStats: async () => ({ categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] }),
      addEntry: vi.fn(), addEntries: vi.fn(),
      updateEntry: vi.fn(), deleteEntry: vi.fn(), validateConnection: vi.fn(),
    };
    api.setAdapter(adapter);
    store = (await import('./store.svelte')).store;
    await store.refreshAll();
  });

  it('keeps an unresolved edit and deletion across an older server refresh', async () => {
    const edit = deferred();
    const deletion = deferred();
    adapter.updateEntry = () => edit.promise;
    adapter.deleteEntry = () => deletion.promise;
    const editing = store.updateEntry(1, { amount: 99 });
    const deleting = store.deleteEntry(2);
    await store.refreshAll(true);
    expect(store.entries.map(entry => [entry.id, entry.amount])).toEqual([[1, 99], [3, 30]]);
    edit.reject(new Error('Edit rejected'));
    deletion.reject(new Error('Delete rejected'));
    await Promise.all([editing, deleting]);
    expect(store.entries.map(entry => entry.id)).toEqual([1, 2, 3]);
    expect(store.entries[0].amount).toBe(10);
  });

  it('hides a bulk selection immediately and restores only definitive failures', async () => {
    const requests = new Map(server.map(entry => [entry.id, deferred()]));
    adapter.deleteEntry = id => requests.get(id)!.promise;
    const deleting = store.deleteEntries([1, 2, 3, 1]);
    expect(store.entries).toEqual([]);
    server = server.filter(entry => entry.id !== 1);
    requests.get(1)!.resolve();
    requests.get(2)!.reject(new Error('Cannot delete Entry 2'));
    requests.get(3)!.reject(new api.ConnectionError('Offline'));
    await deleting;
    expect(store.entries.map(entry => entry.id)).toEqual([2]);
    expect(store.localIds.has(3)).toBe(true);
    expect(store.deletePendingIds.size).toBe(0);
    expect((await import('./toast.svelte')).toast.msg).toContain('Failed to delete 1 entry');
  });

  it('ignores a delayed snapshot after deletion settles', async () => {
    const snapshot = deferred<Entry[]>();
    const oldEntries = server.map(entry => ({ ...entry }));
    adapter.getEntries = () => snapshot.promise;
    const staleRefresh = store.refreshAll(true);
    adapter.getEntries = async () => server;
    adapter.deleteEntry = async id => { server = server.filter(entry => entry.id !== id); };
    await store.deleteEntry(2);
    snapshot.resolve(oldEntries);
    await staleRefresh;
    expect(store.entries.map(entry => entry.id)).toEqual([1, 3]);
  });

  it('rehydrates queued deletes from an older cache and keeps them hidden until sync', async () => {
    const { writeCache } = await import('./cache');
    writeCache({ entries: server, master: store.master, categories: store.categories });
    adapter.deleteEntry = async () => { throw new api.ConnectionError('Offline'); };
    await store.deleteEntry(2);
    expect(store.entries.map(entry => entry.id)).toEqual([1, 3]);
    await store.refreshAll(true);
    expect(store.entries.map(entry => entry.id)).toEqual([1, 3]);

    vi.resetModules();
    api = await import('./api');
    const snapshot = deferred<Entry[]>();
    adapter.getEntries = () => snapshot.promise;
    api.setAdapter(adapter);
    store = (await import('./store.svelte')).store;
    await store.init();
    expect(store.entries.map(entry => entry.id)).toEqual([1, 3]);
    snapshot.resolve(server);
    await vi.waitFor(() => expect(store.syncing).toBe(false));
    expect(store.entries.map(entry => entry.id)).toEqual([1, 3]);

    adapter.getEntries = async () => server;
    adapter.deleteEntry = async id => { server = server.filter(entry => entry.id !== id); };
    await store.drainQueue();
    expect(store.entries.map(entry => entry.id)).toEqual([1, 3]);
    expect(store.localIds.size).toBe(0);
  });

  it('blocks repeated mutations on a pending entry without undoing an unrelated edit', async () => {
    const first = deferred();
    const second = deferred();
    adapter.updateEntry = vi.fn(id => id === 1 ? first.promise : second.promise);
    const editingFirst = store.updateEntry(1, { amount: 99 });
    const editingSecond = store.updateEntry(2, { description: 'Changed' });
    expect(store.submitUpdateEntry(1, { amount: 88 }).accepted).toBe(false);
    expect(await store.deleteEntry(1)).toBe(false);
    expect(adapter.updateEntry).toHaveBeenCalledTimes(2);
    first.reject(new Error('Rejected'));
    await editingFirst;
    expect(store.entries.find(entry => entry.id === 2)?.description).toBe('Changed');
    expect(store.masterLoading).toBe(true);
    server = server.map(entry => entry.id === 2 ? { ...entry, description: 'Changed' } : entry);
    second.resolve();
    await editingSecond;
    expect(store.pendingIds.size).toBe(0);
    expect(store.masterLoading).toBe(false);
  });

  it('uses the confirmed sheet row when an edit changes its date and order', async () => {
    adapter.updateEntry = async (id, patch) => {
      server = server.map(entry => entry.id === id ? { ...entry, ...patch, row: 9 } : entry);
    };
    const submission = store.submitUpdateEntry(1, { date: '2026-10-12' });
    expect(submission.accepted).toBe(true);
    expect(store.entries.find(entry => entry.id === 1)?.date).toBe('2026-10-12');
    await submission.completion;
    expect(store.entries.find(entry => entry.id === 1)?.row).toBe(9);
  });

  it('accepts the sheet row from reconciliation after a new save is confirmed', async () => {
    const payload = { date: '2026-10-11', tag: 'Dining', description: 'New', direction: 'O' as const, amount: 5 };
    adapter.addEntry = async () => {
      const confirmed = { ...payload, id: 4, row: 6, mainCategory: 'FOOD' };
      server = [...server, { ...confirmed, row: 8 }];
      return confirmed;
    };

    expect(await store.addEntry(payload)).toBe(true);

    expect(store.entries.find(entry => entry.id === 4)?.row).toBe(8);
    expect(store.pendingIds.size).toBe(0);
    expect(store.masterLoading).toBe(false);
  });

  it('clears foreground loading when a silent reconciliation supersedes its snapshot', async () => {
    const oldSnapshot = deferred<Entry[]>();
    adapter.getEntries = () => oldSnapshot.promise;
    const refreshing = store.refreshAll();
    // Usable content stays visible during an ordinary refresh (#228).
    expect(store.loading).toBe(false);
    adapter.getEntries = async () => server;
    adapter.updateEntry = async (id, patch) => {
      server = server.map(entry => entry.id === id ? { ...entry, ...patch } : entry);
    };

    await store.updateEntry(1, { amount: 45 });
    oldSnapshot.resolve([]);
    await refreshing;

    expect(store.entries.find(entry => entry.id === 1)?.amount).toBe(45);
    expect(store.loading).toBe(false);
  });

  it('keeps balances loading through batch reconciliation when an overlapping edit fails', async () => {
    const edit = deferred();
    const snapshot = deferred<Entry[]>();
    const legs = [
      { date: '2026-10-11', tag: 'Dining', description: 'Split', direction: 'O' as const, amount: 5 },
      { date: '2026-10-11', tag: 'Dining', description: '^^', direction: 'O' as const, amount: 7 },
    ];
    adapter.updateEntry = () => edit.promise;
    adapter.addEntries = async payloads => {
      const confirmed = payloads.map((payload, index) => ({ ...payload, id: 4 + index, row: 6 + index, mainCategory: 'FOOD' }));
      server = [...server, ...confirmed];
      return confirmed;
    };
    adapter.getEntries = vi.fn().mockImplementationOnce(() => snapshot.promise)
      .mockImplementation(async () => server);
    adapter.getMaster = async () => ({ onHand: 88, budgets: { FOOD: 88 } });
    const adding = store.addEntry(legs);
    await vi.waitFor(() => expect(adapter.getEntries).toHaveBeenCalledOnce());
    const editing = store.updateEntry(1, { amount: 99 });

    edit.reject(new Error('Rejected'));
    expect(await editing).toBe(false);
    expect(store.masterLoading).toBe(true);
    expect(store.pendingIds).toEqual(new Set([4, 5]));
    expect(store.master.onHand).toBe(100);
    snapshot.resolve(server);
    expect(await adding).toBe(true);

    expect(store.entries.map(entry => [entry.id, entry.amount])).toEqual([[1, 10], [2, 20], [3, 30], [4, 5], [5, 7]]);
    expect(store.master.onHand).toBe(88);
    expect(store.pendingIds.size).toBe(0);
    expect(store.masterLoading).toBe(false);
  });

  it('blocks a new edit while the same queued edit is draining', async () => {
    adapter.updateEntry = async () => { throw new api.ConnectionError('Offline'); };
    await store.updateEntry(1, { description: 'Queued' });
    const syncing = deferred();
    adapter.updateEntry = () => syncing.promise;
    const drain = store.drainQueue();
    const submission = store.submitUpdateEntry(1, { description: 'Too soon' });
    expect(submission.accepted).toBe(false);
    expect(await submission.completion).toBe(false);
    expect(store.entries.find(entry => entry.id === 1)?.description).toBe('Queued');
    server = server.map(entry => entry.id === 1 ? { ...entry, description: 'Queued' } : entry);
    syncing.resolve();
    await drain;
    expect(store.entries.find(entry => entry.id === 1)?.description).toBe('Queued');
  });

  it('keeps balances loading after queue delivery until the sheet snapshot arrives', async () => {
    adapter.updateEntry = async () => { throw new api.ConnectionError('Offline'); };
    await store.updateEntry(1, { amount: 50 });
    const snapshot = deferred<Entry[]>();
    adapter.updateEntry = async (id, patch) => {
      server = server.map(entry => entry.id === id ? { ...entry, ...patch } : entry);
    };
    adapter.getEntries = vi.fn(() => snapshot.promise);
    adapter.getMaster = async () => ({ onHand: 60, budgets: { FOOD: 60 } });

    const draining = store.drainQueue();
    await vi.waitFor(() => expect(adapter.getEntries).toHaveBeenCalledOnce());
    expect(store.localIds.size).toBe(0);
    expect(store.masterLoading).toBe(true);
    expect(store.master.onHand).toBe(100);
    snapshot.resolve(server);
    await draining;

    expect(store.entries.find(entry => entry.id === 1)?.amount).toBe(50);
    expect(store.master.onHand).toBe(60);
    expect(store.masterLoading).toBe(false);
    expect(store.draining).toBe(false);
  });

  it('finishes the sheet balance refresh when another mutation rolls back during it', async () => {
    const first = deferred();
    const second = deferred();
    adapter.updateEntry = id => id === 1 ? first.promise : second.promise;
    const saving = store.updateEntry(1, { amount: 40 });
    const failing = store.updateEntry(2, { amount: 99 });
    server = server.map(entry => entry.id === 1 ? { ...entry, amount: 40 } : entry);
    const snapshot = deferred<Entry[]>();
    adapter.getEntries = vi.fn().mockImplementationOnce(() => snapshot.promise)
      .mockImplementation(async () => server);
    adapter.getMaster = async () => ({ onHand: 70, budgets: { FOOD: 70 } });
    first.resolve();
    await vi.waitFor(() => expect(adapter.getEntries).toHaveBeenCalledOnce());
    second.reject(new Error('Rejected'));
    await failing;
    snapshot.resolve(server);
    await saving;
    expect(store.master.onHand).toBe(70);
    expect(store.entries.map(entry => entry.amount)).toEqual([40, 20, 30]);
    expect(store.masterLoading).toBe(false);
  });
});
