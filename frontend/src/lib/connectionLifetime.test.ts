import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { AddEntryPayload } from './types';

const A = { gasUrl: 'https://a.example/exec', apiSecret: 'a-secret' };
const B = { gasUrl: 'https://b.example/exec', apiSecret: 'b-secret' };
const payload: AddEntryPayload = { date: '2026-10-14', tag: 'FOOD', description: 'A save', direction: 'I', amount: 10 };
let offline = false;
const posts: { url: string; body: Record<string, unknown> }[] = [];
function response(body: unknown) { return { text: async () => JSON.stringify(body) }; }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('ms_connection', JSON.stringify(A));
  vi.resetModules();
  offline = false; posts.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const destination = url.startsWith(A.gasUrl) ? 'A' : 'B';
    if (init.body) {
      const body = JSON.parse(String(init.body));
      posts.push({ url, body });
      if (offline) throw new Error('offline');
      return response({ entry: { ...body, id: 1, mainCategory: 'FOOD' } });
    }
    const action = new URL(url).searchParams.get('action');
    return response({
      getEntries: { entries: [{ ...payload, id: 1, description: destination, mainCategory: 'FOOD' }] },
      getMaster: { master: { onHand: destination === 'A' ? 10 : 20, budgets: {} } },
      getCategories: { categories: { FOOD: [] } },
      getConfig: { config: { currency: destination } },
      getStats: { stats: { categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] } },
    }[action!]);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it('initializes each lifetime once even with repeated callers', async () => {
  const { store } = await import('./store.svelte');
  await Promise.all([store.init(), store.init()]);
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('action=getEntries'))).toHaveLength(1);
});

it('keeps A pending saves out of B and restores their original identity on return', async () => {
  const { store } = await import('./store.svelte');
  const { setConnection } = await import('./connection.svelte');
  const { readQueue } = await import('./queue');
  await store.init();
  offline = true;
  await store.addEntry(payload);
  const pending = readQueue();
  setConnection(B);
  expect(store.entries).not.toContainEqual(expect.objectContaining({ description: 'A save' }));
  await store.refreshAll();
  offline = false;
  await store.drainQueue();
  expect(posts.filter(p => p.url === B.gasUrl)).toEqual([]);
  expect(store.entries.map(e => e.description)).toEqual(['B']);
  setConnection(A);
  expect(readQueue()).toEqual(pending);
  await store.drainQueue();
  expect(posts.at(-1)?.body.mutationId).toBe(pending[0].op === 'add' ? pending[0].mutationId : undefined);
});

it('retains unknown-origin legacy work through reload until explicitly associated', async () => {
  const legacy = JSON.stringify([{ op: 'add', tempId: -7, payload, mutationId: 'legacy-key' }]);
  localStorage.setItem('ms_queue', legacy);
  localStorage.setItem('ms_cache', JSON.stringify({ entries: [{ ...payload, id: -7 }], master: { onHand: 999 }, categories: {} }));
  const { store } = await import('./store.svelte');
  await store.init();
  expect(store.entries.map(e => e.description)).toEqual(['A']);
  expect(store.legacyWork).toBe(true);
  await store.drainQueue();
  expect(posts).toEqual([]);
  vi.resetModules();
  const reloaded = (await import('./store.svelte')).store;
  expect(reloaded.legacyWork).toBe(true);
  expect(localStorage.getItem('ms_queue')).toBe(legacy);
  await reloaded.recoverLegacyWork();
  offline = true;
  await reloaded.drainQueue();
  expect(posts.at(-1)?.body.mutationId).toBe('legacy-key');
});

it('ignores a delayed A read failure after B successfully refreshes', async () => {
  const { store } = await import('./store.svelte');
  const { setConnection } = await import('./connection.svelte');
  const { toast } = await import('./toast.svelte');
  await store.init();
  const pending = deferred<ReturnType<typeof response>>();
  vi.mocked(fetch).mockImplementationOnce(() => pending.promise as Promise<Response>);
  const oldRefresh = store.refreshAll();
  setConnection(B);
  await store.init();
  const snapshot = JSON.stringify({ entries: store.entries, master: store.master, categories: store.categories, config: store.config, stats: store.stats });
  pending.reject(new Error('A read failed'));
  await oldRefresh;
  expect(JSON.stringify({ entries: store.entries, master: store.master, categories: store.categories, config: store.config, stats: store.stats })).toBe(snapshot);
  expect(store.error).toBeNull();
  expect(toast.msg).toBeNull();
  expect(store.loading).toBe(false);
});

it.each(['add', 'batch', 'edit', 'delete', 'bulk delete'] as const)('isolates delayed A %s failure and cleanup from B with the same Entry ID', async operation => {
  const { store } = await import('./store.svelte');
  const { setConnection } = await import('./connection.svelte');
  const { toast } = await import('./toast.svelte');
  const { readCache } = await import('./cache');
  await store.init();
  const pending = deferred<ReturnType<typeof response>>();
  vi.mocked(fetch).mockImplementationOnce(() => pending.promise as Promise<Response>);
  const oldMutation = operation === 'add' ? store.addEntry(payload)
    : operation === 'batch' ? store.addEntry([payload, { ...payload, amount: 11 }])
    : operation === 'edit' ? store.updateEntry(1, { description: 'A edit' })
    : operation === 'bulk delete' ? store.deleteEntries([1]) : store.deleteEntry(1);
  setConnection(B);
  expect(store.entries).toEqual([]);
  expect(store.pendingIds.size).toBe(0);
  expect(store.deletePendingIds.size).toBe(0);
  await store.init();
  const cachedB = readCache();
  pending.resolve(response({ error: 'A validation failed' }));
  await oldMutation;
  expect(store.entries.map(e => e.description)).toEqual(['B']);
  expect(store.master.onHand).toBe(20);
  expect(readCache()).toEqual(cachedB);
  expect(store.masterLoading).toBe(false);
  expect(toast.msg).toBeNull();
});

it('stops A replay at the in-flight item and retains A and new B work independently', async () => {
  const { store } = await import('./store.svelte');
  const { setConnection } = await import('./connection.svelte');
  const { readQueue } = await import('./queue');
  await store.init();
  offline = true;
  await store.addEntry(payload);
  await store.addEntry([payload, { ...payload, amount: 11 }]);
  await store.updateEntry(1, { amount: 12 });
  await store.deleteEntry(1);
  const queuedA = readQueue();
  const pending = deferred<ReturnType<typeof response>>();
  vi.mocked(fetch).mockImplementationOnce(() => pending.promise as Promise<Response>);
  const oldReplay = store.drainQueue();
  await vi.waitFor(() => expect(vi.mocked(fetch).mock.results.some(result => result.value === pending.promise)).toBe(true));
  setConnection(B);
  await store.init();
  await store.addEntry({ ...payload, description: 'B save' });
  const queuedB = readQueue();
  pending.resolve(response({ entry: { ...payload, id: 9, mainCategory: 'FOOD' } }));
  await oldReplay;
  expect(readQueue()).toEqual(queuedB);
  expect(store.entries.map(e => e.description)).toEqual(['B', 'B save']);
  setConnection(A);
  expect(readQueue()).toEqual(queuedA.slice(1));
  expect(posts.filter(p => p.url === B.gasUrl)).toHaveLength(1);
});

it('preserves A work across reload and retries with a rotated secret', async () => {
  const { store } = await import('./store.svelte');
  await store.init();
  offline = true;
  await store.addEntry(payload);
  const { readQueue } = await import('./queue');
  const pending = readQueue();
  vi.resetModules();
  const reloaded = (await import('./store.svelte')).store;
  const { setConnection } = await import('./connection.svelte');
  await reloaded.init();
  expect(reloaded.entries).toContainEqual(expect.objectContaining({ description: 'A save', id: -1 }));
  setConnection({ ...A, apiSecret: 'rotated' });
  expect(readQueue()).toEqual(pending);
  offline = false;
  await reloaded.drainQueue();
  expect(posts.at(-1)?.url).toBe(A.gasUrl);
  expect(posts.at(-1)?.body.secret).toBe('rotated');
  expect(posts.at(-1)?.body.mutationId).toBe(pending[0].op === 'add' ? pending[0].mutationId : undefined);
});

it('does not consume real persistence in Mock Mode or publish fixtures into it', async () => {
  const { store } = await import('./store.svelte');
  await store.init();
  offline = true;
  await store.addEntry(payload);
  const saved = { ...localStorage };
  const count = posts.length;
  vi.stubEnv('VITE_MOCK', 'true');
  vi.resetModules();
  const mock = (await import('./store.svelte')).store;
  await mock.init();
  await mock.addEntry({ ...payload, description: 'fixture save' });
  await mock.drainQueue();
  expect(posts).toHaveLength(count);
  expect({ ...localStorage }).toEqual(saved);
  vi.unstubAllEnvs();
});

it('ignores a stale credential failure and retries the preserved save using the new secret', async () => {
  const { store } = await import('./store.svelte');
  const { setConnection } = await import('./connection.svelte');
  const { toast } = await import('./toast.svelte');
  const { readQueue } = await import('./queue');
  await store.init();
  const pending = deferred<ReturnType<typeof response>>();
  vi.mocked(fetch).mockImplementationOnce(() => pending.promise as Promise<Response>);
  const oldSave = store.addEntry(payload);
  const original = readQueue();
  setConnection({ ...A, apiSecret: 'new-secret' });
  await store.init();
  pending.resolve(response({ error: 'unauthorized' }));
  await oldSave;
  expect(toast.msg).toBeNull();
  expect(store.error).toBeNull();
  expect(readQueue()).toEqual(original);
  await store.drainQueue();
  expect(posts.at(-1)?.body.secret).toBe('new-secret');
});

it.each(['add', 'batch', 'edit', 'delete'] as const)('keeps a delayed successful A %s completion out of B', async operation => {
  const { store } = await import('./store.svelte');
  const { setConnection } = await import('./connection.svelte');
  await store.init();
  const pending = deferred<ReturnType<typeof response>>();
  vi.mocked(fetch).mockImplementationOnce(() => pending.promise as Promise<Response>);
  const oldMutation = operation === 'add' ? store.addEntry(payload)
    : operation === 'batch' ? store.addEntry([payload])
    : operation === 'edit' ? store.updateEntry(1, { description: 'A edit' }) : store.deleteEntry(1);
  setConnection(B);
  await store.init();
  const entry = { ...payload, id: 1, mainCategory: 'FOOD' };
  pending.resolve(response({ ok: true,
    ...(operation === 'add' ? { entry } : operation === 'batch' ? { entries: [entry] } : {}),
  }));
  await oldMutation;
  expect(store.entries.map(e => e.description)).toEqual(['B']);
  expect(store.pendingIds.size).toBe(0);
  expect(store.master.onHand).toBe(20);
});

it('keeps one effective online replay handler after repeated initialization and saves', async () => {
  const { store } = await import('./store.svelte');
  const { setConnection } = await import('./connection.svelte');
  const listeners = vi.spyOn(window, 'addEventListener');
  await store.init();
  await store.init();
  setConnection(B);
  await store.init();
  setConnection(B);
  await store.init();
  expect(listeners.mock.calls.filter(([event]) => event === 'online')).toHaveLength(1);
});
