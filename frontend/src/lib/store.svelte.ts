import * as api from './api';
import { ConnectionError, UnauthorizedError } from './api';
import { readCache, writeCache } from './cache';
import { getLocalEntryIds } from './offlineMutation';
import { getMainCategory, buildEntry } from './domain';
import { dedupeEntries } from './dedupe';
import { readQueue } from './queue';
import { createMutationEngine } from './mutationEngine';
import type { EntryStoreSeam, MutationApi } from './mutationEngine';
import type {
  Entry,
  MasterRow,
  CategoryMap,
  Config,
  AddEntryPayload,
  UpdateEntryPatch,
} from './types';

let entries = $state<Entry[]>([]);
let master = $state<MasterRow>({ onHand: 0, budgets: {} });
let categories = $state<CategoryMap>({});
let config = $state<Config>({ currency: "₱" });
let loading = $state(false);
let error = $state<string | null>(null);
let errorIsConnection = $state(false);
let masterLoading = $state(false);
let toastMsg = $state<string | null>(null);
let toastAction = $state<{ label: string; run: () => void } | null>(null);
let toastIsConnection = $state(false);
let toastVariant = $state<'default' | 'destructive'>('default');
let pendingIds = $state(new Set<number>());
let deletePendingIds = $state(new Set<number>());
let localIds = $state<Set<number>>(getLocalEntryIds());
let draining = $state(false);
let syncing = $state(false);

const REQUEST_TIMEOUT_MS = 15_000;

// Svelte 5 requires full reassignment to trigger reactivity on Set state.
function addPending(id: number): void { pendingIds = new Set([...pendingIds, id]); }
function removePending(id: number): void { pendingIds = new Set([...pendingIds].filter((p) => p !== id)); }
function addDeletePending(id: number): void { deletePendingIds = new Set([...deletePendingIds, id]); }
function removeDeletePending(id: number): void { deletePendingIds = new Set([...deletePendingIds].filter((p) => p !== id)); }

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new ConnectionError('Request timed out.')), REQUEST_TIMEOUT_MS)
    ),
  ]);
}

function showToast(
  msgOrErr: unknown,
  action?: { label: string; run: () => void },
  variant: 'default' | 'destructive' = 'default',
): void {
  toastMsg = msgOrErr instanceof Error ? msgOrErr.message : String(msgOrErr);
  toastAction = action ?? null;
  toastIsConnection = msgOrErr instanceof ConnectionError;
  toastVariant = variant;
  // Destructive (auth) toasts stay until dismissed — they require user action.
  if (!action && variant !== 'destructive') {
    setTimeout(() => { toastMsg = null; toastIsConnection = false; toastVariant = 'default'; }, 3000);
  }
}

function injectQueueEntries(): void {
  for (const item of readQueue()) {
    if (item.op === 'add') {
      if (!entries.some((e) => e.id === item.tempId)) {
        entries = [...entries, buildEntry(item.tempId, item.payload, categories)];
      }
    } else if (item.op === 'edit') {
      entries = entries.map((e) =>
        e.id === item.id
          ? { ...e, ...item.patch, mainCategory: item.patch.tag ? getMainCategory(item.patch.tag, categories) : e.mainCategory }
          : e
      );
    }
    // delete items: entry stays visible until drained
  }
}

async function refreshAll(silent = false): Promise<void> {
  if (!silent) {
    loading = true;
    error = null;
    errorIsConnection = false;
  }
  try {
    const [e, m, c, cfg] = await withTimeout(Promise.all([
      api.getEntries(),
      api.getMaster(),
      api.getCategories(),
      api.getConfig(),
    ]));
    entries = e;
    master = m;
    categories = c;
    config = cfg;
    injectQueueEntries();
    localIds = getLocalEntryIds();
    writeCache({ entries, master, categories, config });
  } catch (err) {
    if (!silent) {
      error = err instanceof Error ? err.message : String(err);
      errorIsConnection = err instanceof ConnectionError;
    }
  } finally {
    if (!silent) loading = false;
  }
}

// ---------------------------------------------------------------------------
// EntryStore seam — bridges the engine to Svelte runes state
// ---------------------------------------------------------------------------
const storeSeam: EntryStoreSeam = {
  getEntries: () => entries,
  getCategories: () => categories,
  appendEntry: (entry) => { entries = [...entries, entry]; },
  swapEntry: (id, next) => { entries = entries.map((e) => e.id === id ? next : e); },
  removeEntry: (id) => { entries = entries.filter((e) => e.id !== id); },
  removeEntries: (ids) => { entries = entries.filter((e) => !ids.includes(e.id)); },
  setPending: (id, active) => { active ? addPending(id) : removePending(id); },
  setDeletePending: (id, active) => { active ? addDeletePending(id) : removeDeletePending(id); },
  setMasterLoading: (active) => { masterLoading = active; },
  showToast: (msgOrErr, variant = 'default') => showToast(msgOrErr, undefined, variant),
  clearToast: () => { toastMsg = null; toastAction = null; },
  syncLocalIds: () => { localIds = getLocalEntryIds(); },
  refreshAll: () => refreshAll(true),
};

const mutApi: MutationApi = {
  addEntry: (payload) => withTimeout(api.addEntry(payload)),
  updateEntry: (id, patch) => withTimeout(api.updateEntry(id, patch)),
  deleteEntry: (id) => withTimeout(api.deleteEntry(id)),
};

const engine = createMutationEngine(storeSeam, mutApi);

// ---------------------------------------------------------------------------
// Public mutation surface — delegates to the engine
// ---------------------------------------------------------------------------
function addEntry(payload: AddEntryPayload | AddEntryPayload[]): Promise<void> {
  return Array.isArray(payload) ? engine.addLegs(payload) : engine.add(payload);
}

function updateEntry(id: number, patch: UpdateEntryPatch): Promise<void> {
  return engine.edit(id, patch);
}

function deleteEntry(id: number): Promise<void> {
  return engine.remove(id, entries);
}

function deleteEntries(ids: number[]): Promise<void> {
  return engine.removeMany(ids, entries);
}

async function drainQueue(): Promise<void> {
  if (draining || getLocalEntryIds().size === 0) return;
  draining = true;
  try {
    await engine.drainQueue();
  } finally {
    draining = false;
  }
}

async function init(): Promise<void> {
  localIds = getLocalEntryIds();
  const cache = readCache();
  if (cache) {
    entries = dedupeEntries(cache.entries);
    master = cache.master;
    categories = cache.categories;
    if (cache.config) config = cache.config;
    injectQueueEntries();
    localIds = getLocalEntryIds();
    syncing = true;
    masterLoading = true;
    void refreshAll(true).finally(() => {
      syncing = false;
      masterLoading = false;
    });
  } else {
    await refreshAll(false);
    injectQueueEntries();
    localIds = getLocalEntryIds();
  }
  window.addEventListener('online', () => void drainQueue());
}

export const store = {
  get entries() { return entries; },
  get master() { return master; },
  get categories() { return categories; },
  get config() { return config; },
  get loading() { return loading; },
  get error() { return error; },
  get errorIsConnection() { return errorIsConnection; },
  get masterLoading() { return masterLoading; },
  get toastMsg() { return toastMsg; },
  get toastAction() { return toastAction; },
  get toastIsConnection() { return toastIsConnection; },
  get toastVariant() { return toastVariant; },
  get pendingIds() { return pendingIds; },
  get deletePendingIds() { return deletePendingIds; },
  get localIds() { return localIds; },
  get draining() { return draining; },
  get syncing() { return syncing; },
  init,
  refreshAll,
  addEntry,
  updateEntry,
  deleteEntry,
  deleteEntries,
  drainQueue,
  dismissToast: () => { toastMsg = null; toastAction = null; toastIsConnection = false; toastVariant = 'default'; },
};
