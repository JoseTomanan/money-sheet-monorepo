import { describe, it, expect, beforeEach, vi } from 'vitest';
import { nextTempId, _resetTempIdCounter, createMutationEngine } from './mutationEngine';
import type { EntryStoreSeam, MutationApi } from './mutationEngine';
import type { Entry, CategoryMap, AddEntryPayload, UpdateEntryPatch } from './types';
import { writeQueue, clearQueue } from './queue';
import { UnauthorizedError, ConnectionError } from './api';

// ---------------------------------------------------------------------------
// In-memory fake seam — exercises the engine without Svelte runes
// ---------------------------------------------------------------------------
function makeFakeSeam(initialEntries: Entry[] = []): EntryStoreSeam & {
  entries: Entry[];
  pending: Set<number>;
  deletePending: Set<number>;
  masterLoading: boolean;
  toasts: Array<{ msg: unknown; variant: string }>;
  syncCount: number;
  refreshCount: number;
} {
  let entries = [...initialEntries];
  const pending = new Set<number>();
  const deletePending = new Set<number>();
  let masterLoading = false;
  const toasts: Array<{ msg: unknown; variant: string }> = [];
  let syncCount = 0;
  let refreshCount = 0;

  const categories: CategoryMap = { FOOD: ['Groceries', 'Dining'], HOUSING: ['Rent'] };

  return {
    get entries() { return entries; },
    get pending() { return pending; },
    get deletePending() { return deletePending; },
    get masterLoading() { return masterLoading; },
    get toasts() { return toasts; },
    get syncCount() { return syncCount; },
    get refreshCount() { return refreshCount; },

    getEntries: () => entries,
    getCategories: () => categories,
    appendEntry: (e) => { entries = [...entries, e]; },
    swapEntry: (id, next) => { entries = entries.map((e) => e.id === id ? next : e); },
    removeEntry: (id) => { entries = entries.filter((e) => e.id !== id); },
    removeEntries: (ids) => { entries = entries.filter((e) => !ids.includes(e.id)); },
    setPending: (id, active) => { active ? pending.add(id) : pending.delete(id); },
    setDeletePending: (id, active) => { active ? deletePending.add(id) : deletePending.delete(id); },
    setMasterLoading: (v) => { masterLoading = v; },
    showToast: (msg, variant = 'default') => toasts.push({ msg, variant }),
    clearToast: () => { toasts.push({ msg: null, variant: 'clear' }); },
    syncLocalIds: () => { syncCount++; },
    refreshAll: async () => { refreshCount++; },
  };
}

const CATEGORIES: CategoryMap = { FOOD: ['Groceries', 'Dining'], HOUSING: ['Rent'] };
const BASE_PAYLOAD: AddEntryPayload = { date: '2026-01-01', tag: 'Groceries', description: 'lunch', direction: 'O', amount: 50 };
const CONFIRMED_ENTRY: Entry = { id: 42, date: '2026-01-01', tag: 'Groceries', mainCategory: 'FOOD', description: 'lunch', direction: 'O', amount: 50 };

function makeApi(overrides: Partial<MutationApi> = {}): MutationApi {
  return {
    addEntry: vi.fn(async () => CONFIRMED_ENTRY),
    updateEntry: vi.fn(async () => {}),
    deleteEntry: vi.fn(async () => {}),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Slice 1 — temp-id generator
// ---------------------------------------------------------------------------
describe('nextTempId', () => {
  beforeEach(() => { _resetTempIdCounter(); clearQueue(); });

  it('returns a negative integer', () => {
    expect(nextTempId()).toBeLessThan(0);
  });

  it('is strictly monotonically decreasing on each call', () => {
    const ids = [nextTempId(), nextTempId(), nextTempId()];
    expect(ids[0]).toBeGreaterThan(ids[1]);
    expect(ids[1]).toBeGreaterThan(ids[2]);
  });

  it('rapid sequential calls never collide', () => {
    const ids = Array.from({ length: 100 }, () => nextTempId());
    expect(new Set(ids).size).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Slice 2 — add: happy path (confirmed)
// ---------------------------------------------------------------------------

describe('engine.add — confirmed', () => {
  beforeEach(() => { _resetTempIdCounter(); clearQueue(); });

  it('inserts an optimistic entry with a negative temp id before the network call', async () => {
    const seam = makeFakeSeam();
    let capturedBeforeResolve = false;
    const api = makeApi({
      addEntry: vi.fn(async () => {
        capturedBeforeResolve = seam.entries.some((e) => e.id < 0);
        return CONFIRMED_ENTRY;
      }),
    });
    const engine = createMutationEngine(seam, api);
    await engine.add(BASE_PAYLOAD);
    expect(capturedBeforeResolve).toBe(true);
  });

  it('replaces the temp entry with the confirmed real entry', async () => {
    const seam = makeFakeSeam();
    const engine = createMutationEngine(seam, makeApi());
    await engine.add(BASE_PAYLOAD);
    expect(seam.entries).toHaveLength(1);
    expect(seam.entries[0].id).toBe(CONFIRMED_ENTRY.id);
  });

  it('triggers a refresh after confirmation', async () => {
    const seam = makeFakeSeam();
    const engine = createMutationEngine(seam, makeApi());
    await engine.add(BASE_PAYLOAD);
    expect(seam.refreshCount).toBeGreaterThan(0);
  });

  it('leaves masterLoading false after completion', async () => {
    const seam = makeFakeSeam();
    const engine = createMutationEngine(seam, makeApi());
    await engine.add(BASE_PAYLOAD);
    expect(seam.masterLoading).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Slice 3 — add: queued (offline / connection error)
// ---------------------------------------------------------------------------
describe('engine.add — queued', () => {
  beforeEach(() => { _resetTempIdCounter(); clearQueue(); });

  it('keeps the temp entry as a Local Entry (no swap, no removal)', async () => {
    const api = makeApi({ addEntry: vi.fn(async () => { throw new ConnectionError('offline'); }) });
    const seam = makeFakeSeam();
    const engine = createMutationEngine(seam, api);
    await engine.add(BASE_PAYLOAD);
    expect(seam.entries).toHaveLength(1);
    expect(seam.entries[0].id).toBeLessThan(0);
  });

  it('does NOT refresh after queuing', async () => {
    const api = makeApi({ addEntry: vi.fn(async () => { throw new ConnectionError('offline'); }) });
    const seam = makeFakeSeam();
    const engine = createMutationEngine(seam, api);
    await engine.add(BASE_PAYLOAD);
    expect(seam.refreshCount).toBe(0);
  });

  it('syncs local ids after queuing', async () => {
    const api = makeApi({ addEntry: vi.fn(async () => { throw new ConnectionError('offline'); }) });
    const seam = makeFakeSeam();
    const engine = createMutationEngine(seam, api);
    await engine.add(BASE_PAYLOAD);
    expect(seam.syncCount).toBeGreaterThan(0);
  });

  it('shows destructive toast on UnauthorizedError', async () => {
    const api = makeApi({ addEntry: vi.fn(async () => { throw new UnauthorizedError('nope'); }) });
    const seam = makeFakeSeam();
    const engine = createMutationEngine(seam, api);
    await engine.add(BASE_PAYLOAD);
    expect(seam.toasts.some((t) => t.variant === 'destructive')).toBe(true);
  });

  it('shows NO toast for a plain connection error', async () => {
    const api = makeApi({ addEntry: vi.fn(async () => { throw new ConnectionError('offline'); }) });
    const seam = makeFakeSeam();
    const engine = createMutationEngine(seam, api);
    await engine.add(BASE_PAYLOAD);
    expect(seam.toasts.filter((t) => t.msg !== null)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Slice 4 — edit: confirmed, failed (rollback), queued
// ---------------------------------------------------------------------------
const EXISTING: Entry = { id: 10, date: '2026-01-01', tag: 'Groceries', mainCategory: 'FOOD', description: 'old', direction: 'O', amount: 20 };

describe('engine.edit — confirmed', () => {
  beforeEach(() => { _resetTempIdCounter(); clearQueue(); });

  it('applies the patch optimistically before awaiting the network', async () => {
    let patchedBeforeResolve = false;
    const seam = makeFakeSeam([EXISTING]);
    const api = makeApi({
      updateEntry: vi.fn(async () => {
        patchedBeforeResolve = seam.entries[0].description === 'new';
      }),
    });
    const engine = createMutationEngine(seam, api);
    await engine.edit(10, { description: 'new' });
    expect(patchedBeforeResolve).toBe(true);
  });

  it('refreshes after a confirmed edit', async () => {
    const seam = makeFakeSeam([EXISTING]);
    const engine = createMutationEngine(seam, makeApi());
    await engine.edit(10, { description: 'new' });
    expect(seam.refreshCount).toBeGreaterThan(0);
  });
});

describe('engine.edit — failed (server error)', () => {
  beforeEach(() => { _resetTempIdCounter(); clearQueue(); });

  it('rolls back the optimistic patch to the previous value', async () => {
    const seam = makeFakeSeam([EXISTING]);
    const api = makeApi({ updateEntry: vi.fn(async () => { throw new Error('server error'); }) });
    const engine = createMutationEngine(seam, api);
    await engine.edit(10, { description: 'new' });
    expect(seam.entries[0].description).toBe('old');
  });

  it('shows a toast on failure', async () => {
    const seam = makeFakeSeam([EXISTING]);
    const api = makeApi({ updateEntry: vi.fn(async () => { throw new Error('oops'); }) });
    const engine = createMutationEngine(seam, api);
    await engine.edit(10, { description: 'new' });
    expect(seam.toasts.some((t) => t.msg !== null)).toBe(true);
  });
});

describe('engine.edit — queued (connection error)', () => {
  beforeEach(() => { _resetTempIdCounter(); clearQueue(); });

  it('keeps the optimistic patch visible and does not refresh', async () => {
    const seam = makeFakeSeam([EXISTING]);
    const api = makeApi({ updateEntry: vi.fn(async () => { throw new ConnectionError('offline'); }) });
    const engine = createMutationEngine(seam, api);
    await engine.edit(10, { description: 'new' });
    expect(seam.entries[0].description).toBe('new');
    expect(seam.refreshCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Slice 5 — remove: confirmed, local coalesce, queued
// ---------------------------------------------------------------------------
const REMOTE_ENTRY: Entry = { id: 99, date: '2026-01-01', tag: 'Groceries', mainCategory: 'FOOD', description: 'x', direction: 'O', amount: 10 };

describe('engine.remove — confirmed', () => {
  beforeEach(() => { _resetTempIdCounter(); clearQueue(); });

  it('removes the entry and refreshes', async () => {
    const seam = makeFakeSeam([REMOTE_ENTRY]);
    const engine = createMutationEngine(seam, makeApi());
    await engine.remove(99, seam.entries);
    expect(seam.entries.find((e) => e.id === 99)).toBeUndefined();
    expect(seam.refreshCount).toBeGreaterThan(0);
  });

  it('is a no-op when the entry is not present', async () => {
    const seam = makeFakeSeam([REMOTE_ENTRY]);
    const engine = createMutationEngine(seam, makeApi());
    await engine.remove(999, seam.entries);
    expect(seam.entries).toHaveLength(1);
    expect(seam.refreshCount).toBe(0);
  });
});

describe('engine.remove — local entry (queue coalesce)', () => {
  beforeEach(() => { _resetTempIdCounter(); clearQueue(); });

  it('removes a Local Entry optimistically without a network call', async () => {
    // Enqueue an add so the entry is "local" (negative temp id in queue)
    writeQueue([{ op: 'add', tempId: -1, payload: BASE_PAYLOAD }]);
    const localEntry: Entry = { id: -1, date: '2026-01-01', tag: 'Groceries', mainCategory: 'FOOD', description: 'lunch', direction: 'O', amount: 50 };
    const seam = makeFakeSeam([localEntry]);
    const api = makeApi({ deleteEntry: vi.fn(async () => {}) });
    const engine = createMutationEngine(seam, api);
    await engine.remove(-1, seam.entries);
    // The entry should be gone immediately
    expect(seam.entries.find((e) => e.id === -1)).toBeUndefined();
    // Network delete should NOT have been called (local entry → coalesced in queue)
    expect(api.deleteEntry).not.toHaveBeenCalled();
  });
});

describe('engine.remove — queued (connection error)', () => {
  beforeEach(() => { _resetTempIdCounter(); clearQueue(); });

  it('does not refresh on connection error for a remote entry', async () => {
    const seam = makeFakeSeam([REMOTE_ENTRY]);
    const api = makeApi({ deleteEntry: vi.fn(async () => { throw new ConnectionError('offline'); }) });
    const engine = createMutationEngine(seam, api);
    await engine.remove(99, seam.entries);
    expect(seam.refreshCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Slice 6 — addLegs sequencing: main leg confirmed before ditto legs fire
// ---------------------------------------------------------------------------
describe('engine.addLegs — sequencing', () => {
  beforeEach(() => { _resetTempIdCounter(); clearQueue(); });

  it('does not call addEntry for ditto legs until the main leg resolves', async () => {
    const callOrder: string[] = [];
    let mainResolve!: (e: Entry) => void;
    const mainPromise = new Promise<Entry>((res) => { mainResolve = res; });

    const api = makeApi({
      addEntry: vi.fn((payload: AddEntryPayload) => {
        if (payload.description === 'main') {
          callOrder.push('main-start');
          return mainPromise.then((e) => { callOrder.push('main-done'); return e; });
        }
        callOrder.push('ditto');
        return Promise.resolve({ ...CONFIRMED_ENTRY, id: 43 });
      }),
    });

    const legs: AddEntryPayload[] = [
      { ...BASE_PAYLOAD, description: 'main' },
      { ...BASE_PAYLOAD, description: '^^' },
    ];

    const seam = makeFakeSeam();
    const engine = createMutationEngine(seam, api);
    const done = engine.addLegs(legs);

    // Ditto leg should NOT have started yet (main hasn't resolved)
    expect(callOrder).toEqual(['main-start']);

    mainResolve(CONFIRMED_ENTRY);
    await done;

    expect(callOrder.indexOf('main-done')).toBeLessThan(callOrder.indexOf('ditto'));
  });

  it('inserts all legs as optimistic entries immediately', async () => {
    let countAtStart = 0;
    const api = makeApi({
      addEntry: vi.fn(async (p: AddEntryPayload) => {
        countAtStart = countAtStart || 0; // captured outside
        return { ...CONFIRMED_ENTRY, id: p.description === '^^' ? 43 : 42 };
      }),
    });
    const seam = makeFakeSeam();
    const legs: AddEntryPayload[] = [
      { ...BASE_PAYLOAD, description: 'main' },
      { ...BASE_PAYLOAD, description: '^^' },
    ];
    // Intercept first call to count before network resolves
    let initialCount = 0;
    const origAddEntry = api.addEntry as ReturnType<typeof vi.fn>;
    (api as MutationApi).addEntry = vi.fn(async (p: AddEntryPayload) => {
      if (initialCount === 0) initialCount = seam.entries.length;
      return origAddEntry(p);
    });
    await createMutationEngine(seam, api).addLegs(legs);
    expect(initialCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Slice 7 — drainQueue
// ---------------------------------------------------------------------------
describe('engine.drainQueue', () => {
  beforeEach(() => { _resetTempIdCounter(); clearQueue(); });

  it('swaps a drained add from temp to real id', async () => {
    const localEntry: Entry = { id: -1, date: '2026-01-01', tag: 'Groceries', mainCategory: 'FOOD', description: 'q', direction: 'O', amount: 10 };
    writeQueue([{ op: 'add', tempId: -1, payload: BASE_PAYLOAD }]);
    const seam = makeFakeSeam([localEntry]);
    const api = makeApi({ addEntry: vi.fn(async () => CONFIRMED_ENTRY) });
    const engine = createMutationEngine(seam, api);
    await engine.drainQueue();
    expect(seam.entries.find((e) => e.id === -1)).toBeUndefined();
    expect(seam.entries.find((e) => e.id === CONFIRMED_ENTRY.id)).toBeDefined();
  });

  it('removes a drained delete entry from the list', async () => {
    writeQueue([{ op: 'delete', id: 99 }]);
    const seam = makeFakeSeam([REMOTE_ENTRY]);
    const engine = createMutationEngine(seam, makeApi());
    await engine.drainQueue();
    expect(seam.entries.find((e) => e.id === 99)).toBeUndefined();
  });

  it('refreshes when all items are drained', async () => {
    writeQueue([{ op: 'delete', id: 99 }]);
    const seam = makeFakeSeam([REMOTE_ENTRY]);
    const engine = createMutationEngine(seam, makeApi());
    await engine.drainQueue();
    expect(seam.refreshCount).toBe(1);
  });

  it('does NOT refresh when a drain item stops (network fail)', async () => {
    writeQueue([{ op: 'delete', id: 99 }]);
    const seam = makeFakeSeam([REMOTE_ENTRY]);
    const api = makeApi({ deleteEntry: vi.fn(async () => { throw new ConnectionError('offline'); }) });
    const engine = createMutationEngine(seam, api);
    await engine.drainQueue();
    expect(seam.refreshCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Slice 8 — injectQueue: re-derive Local Entries from the persisted queue
// ---------------------------------------------------------------------------
describe('engine.injectQueue', () => {
  beforeEach(() => { _resetTempIdCounter(); clearQueue(); });

  it('appends a Local Entry for a queued add item not already present', () => {
    writeQueue([{ op: 'add', tempId: -1, payload: BASE_PAYLOAD }]);
    const seam = makeFakeSeam();
    const engine = createMutationEngine(seam, makeApi());
    engine.injectQueue();
    expect(seam.entries).toHaveLength(1);
    expect(seam.entries[0]).toMatchObject({ id: -1, mainCategory: 'FOOD', tag: 'Groceries' });
  });

  it('is idempotent: does not duplicate an add item already present in entries', () => {
    writeQueue([{ op: 'add', tempId: -1, payload: BASE_PAYLOAD }]);
    const localEntry: Entry = { id: -1, date: '2026-01-01', tag: 'Groceries', mainCategory: 'FOOD', description: 'lunch', direction: 'O', amount: 50 };
    const seam = makeFakeSeam([localEntry]);
    const engine = createMutationEngine(seam, makeApi());
    engine.injectQueue();
    expect(seam.entries).toHaveLength(1);
  });

  it('re-resolves mainCategory for a queued edit that changes tag', () => {
    writeQueue([{ op: 'edit', id: 10, patch: { tag: 'Rent' } }]);
    const seam = makeFakeSeam([EXISTING]);
    const engine = createMutationEngine(seam, makeApi());
    engine.injectQueue();
    const patched = seam.entries.find((e) => e.id === 10);
    expect(patched?.tag).toBe('Rent');
    expect(patched?.mainCategory).toBe('HOUSING');
  });

  it('leaves a queued delete item as a no-op — entry stays visible until drained', () => {
    writeQueue([{ op: 'delete', id: 10 }]);
    const seam = makeFakeSeam([EXISTING]);
    const engine = createMutationEngine(seam, makeApi());
    engine.injectQueue();
    expect(seam.entries.find((e) => e.id === 10)).toBeDefined();
  });
});
