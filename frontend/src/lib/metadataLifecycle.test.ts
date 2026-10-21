import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CategoryMap, Config, Entry, GatewayAdapter } from './types';

const URL = 'https://metadata.example/exec';
const payload = { date: '2026-10-21', tag: 'Dining', description: 'Lunch', direction: 'O' as const, amount: 10 };
const row = { ...payload, id: 1, row: 3, mainCategory: 'FOOD' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
let store: typeof import('./store.svelte')['store'];
let adapter: GatewayAdapter;
async function reload() {
  store?.dispose();
  vi.resetModules();
  (await import('./api')).setAdapter(adapter);
  store = (await import('./store.svelte')).store;
  await store.init();
  await store.refreshAll();
}
async function cache() { return (await import('./cache')).readCache(URL)!; }
beforeEach(async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-21T02:00:00Z'));
  localStorage.clear();
  localStorage.setItem('ms_connection', JSON.stringify({ gasUrl: URL, apiSecret: 'test' }));
  vi.resetModules();
  adapter = {
    getEntries: vi.fn(async () => [row]),
    getMaster: vi.fn(async () => ({ onHand: 100, budgets: { FOOD: 100 } })),
    getCategories: vi.fn(async () => ({ FOOD: ['Dining'] })),
    getConfig: vi.fn(async () => ({ currency: 'P' })),
    getStats: vi.fn(async () => ({ categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] })),
    addEntry: vi.fn(async () => ({ ...row, id: 2 })), addEntries: vi.fn(),
    updateEntry: vi.fn(async () => {}), deleteEntry: vi.fn(async () => {}), validateConnection: vi.fn(),
  };
  (await import('./api')).setAdapter(adapter);
  store = (await import('./store.svelte')).store;
});
afterEach(() => { store?.dispose(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it('makes five cold reads then only thirty financial reads for ten isolated Entry reconciliations', async () => {
  await store.init();
  for (let i = 0; i < 10; i++) await store.updateEntry(1, { amount: i });
  expect(adapter.getCategories).toHaveBeenCalledTimes(1);
  expect(adapter.getConfig).toHaveBeenCalledTimes(1);
  for (const read of [adapter.getEntries, adapter.getMaster, adapter.getStats]) expect(read).toHaveBeenCalledTimes(11);
  const original = await cache();
  await reload();
  expect(adapter.getCategories).toHaveBeenCalledTimes(1);
  expect(adapter.getConfig).toHaveBeenCalledTimes(1);
  expect((await cache()).categoriesFetchedAt).toBe(original.categoriesFetchedAt);
});

it('expires resources independently, preserving their successful response times through financial saves', async () => {
  const config = deferred<Config>();
  adapter.getConfig = vi.fn(() => config.promise);
  await store.init();
  await vi.advanceTimersByTimeAsync(60_000);
  config.resolve({ currency: '$' }); await vi.advanceTimersByTimeAsync(0);
  const original = await cache();
  await vi.advanceTimersByTimeAsync(239_999);
  await store.refreshAll();
  expect(adapter.getCategories).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1); await store.refreshAll();
  expect(adapter.getCategories).toHaveBeenCalledTimes(2);
  expect(adapter.getConfig).toHaveBeenCalledTimes(1);
  expect((await cache()).configFetchedAt).toBe(original.configFetchedAt);
  await vi.advanceTimersByTimeAsync(60_000); await store.refreshAll();
  expect(adapter.getConfig).toHaveBeenCalledTimes(2);
});

it.each([undefined, null, 'tomorrow', Infinity, -1, Date.parse('2026-10-22')])('revalidates legacy/invalid persisted freshness %s', async stamp => {
  const { writeCache } = await import('./cache');
  writeCache({ entries: [row], master: { onHand: 50, budgets: {} }, categories: {}, config: { currency: 'old' }, categoriesFetchedAt: stamp as number, configFetchedAt: stamp as number });
  await store.init(); await store.refreshAll();
  expect(adapter.getCategories).toHaveBeenCalledOnce(); expect(adapter.getConfig).toHaveBeenCalledOnce();
});

it('joins delayed metadata through financial cycles, writes, and forced refresh, persisting Config when it arrives last', async () => {
  const config = deferred<Config>();
  adapter.getConfig = vi.fn(() => config.promise);
  await store.init();
  await store.updateEntry(1, { amount: 15 });
  await store.refreshAll();
  await store.retrySync();
  expect(adapter.getConfig).toHaveBeenCalledOnce();
  expect(store.syncStatus.phase).toBe('busy');
  config.resolve({ currency: 'late' }); await vi.advanceTimersByTimeAsync(0);
  expect(store.config.currency).toBe('late');
  expect((await cache()).config?.currency).toBe('late');
  await reload();
  expect(store.config.currency).toBe('late'); expect(adapter.getConfig).toHaveBeenCalledOnce();
});

it('persists metadata before cold financial reads without fabricating a usable financial snapshot', async () => {
  const entries = deferred<Entry[]>();
  adapter.getEntries = () => entries.promise;
  const initializing = store.init(); await vi.advanceTimersByTimeAsync(0);
  expect((await cache()).config?.currency).toBe('P');
  expect((await cache()).financialAvailable).toBe(false);
  expect(store.hasSnapshot).toBe(false);
  entries.resolve([row]); await initializing;
  expect((await cache()).financialAvailable).toBe(true);
});

it('preserves the latest baseline, acknowledgments, tombstones and other timestamp on metadata-only saves', async () => {
  await store.init();
  const pending = deferred<Config>(); adapter.getConfig = () => pending.promise;
  await store.retrySync();
  const { writeCache } = await import('./cache');
  const baseline = await cache();
  writeCache({ ...baseline, master: { onHand: 999, budgets: {} }, acknowledged: { entries: [{ ...row, id: 8 }], deletedIds: [1] } });
  pending.resolve({ currency: 'new' }); await vi.advanceTimersByTimeAsync(0);
  const saved = await cache();
  expect(saved.master.onHand).toBe(999); expect(saved.acknowledged?.deletedIds).toEqual([1]);
  expect(saved.acknowledged?.entries[0].id).toBe(8);
  expect(saved.categoriesFetchedAt).toBe(baseline.categoriesFetchedAt);
});

it('retains confirmed metadata and reconciles finances after failure, reporting the cause and allowing explicit retry', async () => {
  await store.init();
  const original = await cache();
  adapter.getCategories = vi.fn(async () => { throw new Error('Categories permission denied'); });
  adapter.getConfig = vi.fn(async () => { throw new Error('Settings failed'); });
  adapter.getMaster = async () => ({ onHand: 200, budgets: {} });
  await store.retrySync();
  expect(store.master.onHand).toBe(200); expect(store.categories).toEqual({ FOOD: ['Dining'] });
  expect(store.syncStatus.phase).toBe('waiting'); expect(store.syncStatus.detail).toContain('permission denied');
  expect((await cache()).categoriesFetchedAt).toBe(original.categoriesFetchedAt);
  await vi.advanceTimersByTimeAsync(600_000);
  expect(adapter.getCategories).toHaveBeenCalledOnce();
  adapter.getCategories = vi.fn(async () => ({})); adapter.getConfig = vi.fn(async () => ({ currency: 'ok' }));
  await store.retrySync();
  expect(store.categories).toEqual({}); expect(store.syncStatus.phase).toBe('ready');
});

it('does not claim a usable cold snapshot on Categories failure; a successful empty map is confirmed', async () => {
  adapter.getCategories = vi.fn(async () => { throw new Error('Categories offline'); });
  await store.init();
  expect(store.hasSnapshot).toBe(false); expect(store.syncStatus.phase).toBe('waiting');
  expect((await cache()).categoriesAvailable).toBe(false);
  adapter.getCategories = vi.fn(async () => ({}));
  await store.retrySync();
  expect(store.hasSnapshot).toBe(true); expect(store.categories).toEqual({});
  await reload(); expect(adapter.getCategories).toHaveBeenCalledOnce();
});

it('forces both resources while fresh and retains the force intent through the existing queued delivery owner', async () => {
  await store.init();
  const { ConnectionError } = await import('./api');
  adapter.addEntry = async () => { throw new ConnectionError('offline'); };
  await store.addEntry(payload);
  adapter.getCategories = vi.fn(async () => ({ FOOD: ['New'] }));
  adapter.getConfig = vi.fn(async () => ({ currency: 'changed' }));
  const write = deferred<Entry>(); adapter.addEntry = vi.fn(() => write.promise);
  const retry = store.retrySync();
  expect(adapter.getConfig).not.toHaveBeenCalled();
  write.resolve({ ...row, id: 2 }); await retry;
  expect(adapter.addEntry).toHaveBeenCalledOnce(); expect(adapter.getConfig).toHaveBeenCalledOnce();
  expect(store.categories).toEqual({ FOOD: ['New'] }); expect(store.config.currency).toBe('changed');
});

it.each(['success', 'failure'] as const)('isolates delayed metadata %s from a new URL and credential lifetime', async outcome => {
  await store.init();
  const pending = deferred<Config>(); adapter.getConfig = vi.fn(() => pending.promise);
  await store.retrySync();
  const { setConnection } = await import('./connection.svelte');
  adapter.getConfig = vi.fn(async () => ({ currency: 'B' }));
  setConnection({ gasUrl: 'https://b.example/exec', apiSecret: 'b' }); await store.refreshAll();
  if (outcome === 'success') pending.resolve({ currency: 'obsolete' }); else pending.reject(new Error('obsolete failure'));
  await vi.advanceTimersByTimeAsync(0);
  expect(store.config.currency).toBe('B'); expect(store.syncStatus.phase).toBe('ready');
  expect((await cache()).config?.currency).toBe('P');
  setConnection({ gasUrl: URL, apiSecret: 'rotated' }); await store.refreshAll();
  expect(store.config.currency).toBe('P');
  expect(adapter.getConfig).toHaveBeenCalledOnce();
});

it('cannot join or clear an old same-URL request on secret rotation or publish after disposal', async () => {
  const old = deferred<Config>(); adapter.getConfig = vi.fn(() => old.promise);
  await store.init();
  const current = deferred<Config>(); adapter.getConfig = vi.fn(() => current.promise);
  (await import('./connection.svelte')).setConnection({ gasUrl: URL, apiSecret: 'rotated' });
  await store.refreshAll(); expect(adapter.getConfig).toHaveBeenCalledOnce();
  old.resolve({ currency: 'old' }); await vi.advanceTimersByTimeAsync(0);
  expect(store.syncStatus.phase).toBe('busy'); expect(store.config.currency).not.toBe('old');
  store.dispose(); current.resolve({ currency: 'disposed' }); await vi.advanceTimersByTimeAsync(0);
  expect((await cache()).config).toBeUndefined(); expect(store.syncStatus.phase).toBe('inactive');
});


it('joins a pending Categories read while Entry revisions change and publishes it independently', async () => {
  await store.init();
  const pending = deferred<CategoryMap>(); adapter.getCategories = vi.fn(() => pending.promise);
  await store.retrySync();
  await store.updateEntry(1, { amount: 22 });
  await store.refreshAll();
  expect(adapter.getCategories).toHaveBeenCalledOnce();
  expect(store.master.onHand).toBe(100); expect(store.hasSnapshot).toBe(true);
  pending.resolve({ FOOD: ['Renamed'] }); await vi.advanceTimersByTimeAsync(0);
  expect(store.categories).toEqual({ FOOD: ['Renamed'] });
  expect((await cache()).categories).toEqual({ FOOD: ['Renamed'] });
  expect(store.syncStatus.phase).toBe('ready');
});

it('reconnect retries a failed metadata request without polling or replacing confirmed values', async () => {
  await store.init();
  adapter.getConfig = vi.fn(async () => { throw new Error('Settings disconnected'); });
  await store.retrySync();
  expect(store.config.currency).toBe('P');
  adapter.getConfig = vi.fn(async () => ({ currency: 'reconnected' }));
  window.dispatchEvent(new Event('online'));
  await store.refreshAll();
  expect(store.config.currency).toBe('reconnected'); expect(adapter.getConfig).toHaveBeenCalledOnce();
});

it('keeps Mock metadata ephemeral and sends no requests with no Connection', async () => {
  const pending = deferred<Config>(); adapter.getConfig = vi.fn(() => pending.promise);
  await store.init();
  const { setConnection } = await import('./connection.svelte');
  vi.stubEnv('VITE_MOCK', 'true');
  adapter.getConfig = vi.fn(async () => ({ currency: 'demo' }));
  setConnection({ gasUrl: URL, apiSecret: 'demo-transition' }); await store.refreshAll();
  pending.resolve({ currency: 'old-real' }); await vi.advanceTimersByTimeAsync(0);
  expect(store.config.currency).toBe('demo'); expect((await cache()).config).toBeUndefined();
  vi.unstubAllEnvs(); store.dispose(); vi.resetModules();
  localStorage.removeItem('ms_connection'); localStorage.setItem('ms_mock_dismissed', '1');
  (await import('./api')).setAdapter(adapter);
  const calls = vi.mocked(adapter.getConfig).mock.calls.length;
  store = (await import('./store.svelte')).store;
  await store.init(); await store.retrySync();
  expect(adapter.getConfig).toHaveBeenCalledTimes(calls);
  expect(store.syncStatus.phase).toBe('inactive');
});


it.each(['categories', 'config'] as const)('reload fetches only missing %s while reusing the other resource', async resource => {
  await store.init();
  const saved = await cache();
  const { writeCache } = await import('./cache');
  if (resource === 'categories') writeCache({ ...saved, categoriesAvailable: false, categoriesFetchedAt: undefined });
  else writeCache({ ...saved, config: undefined, configFetchedAt: undefined });
  await reload();
  expect(adapter.getCategories).toHaveBeenCalledTimes(resource === 'categories' ? 2 : 1);
  expect(adapter.getConfig).toHaveBeenCalledTimes(resource === 'config' ? 2 : 1);
});


it('does not retry failed metadata automatically for a trailing financial revision', async () => {
  await store.init();
  const financial = deferred<Entry[]>(); adapter.getEntries = () => financial.promise;
  adapter.getConfig = vi.fn(async () => { throw new Error('Settings failed'); });
  const refresh = store.retrySync(); await vi.advanceTimersByTimeAsync(0);
  await store.updateEntry(1, { amount: 99 });
  financial.resolve([row]); await refresh;
  expect(adapter.getConfig).toHaveBeenCalledOnce();
  expect(store.syncStatus.phase).toBe('waiting');
});
