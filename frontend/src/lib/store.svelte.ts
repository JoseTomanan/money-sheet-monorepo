import * as api from './api';
import { isQueueable } from './api';
import { loadSnapshot, saveSnapshot } from './cacheSync';
import { toast } from './toast.svelte';
import { getLocalEntryIds } from './offlineMutation';
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
let pendingIds = $state(new Set<number>());
let deletePendingIds = $state(new Set<number>());
let localIds = $state<Set<number>>(getLocalEntryIds());
let draining = $state(false);
let syncing = $state(false);

// Svelte 5 requires full reassignment to trigger reactivity on Set state.
function addPending(id: number): void { pendingIds = new Set([...pendingIds, id]); }
function removePending(id: number): void { pendingIds = new Set([...pendingIds].filter((p) => p !== id)); }
function addDeletePending(id: number): void { deletePendingIds = new Set([...deletePendingIds, id]); }
function removeDeletePending(id: number): void { deletePendingIds = new Set([...deletePendingIds].filter((p) => p !== id)); }

// Requests race independently rather than via Promise.all: the 4 endpoints
// share one GAS deployment, and firing them concurrently occasionally trips
// a transient connection failure (e.g. net::ERR_NETWORK_CHANGED) on just one
// of them. A single reject shouldn't discard the other 3 that succeeded.
async function refreshAll(silent = false): Promise<void> {
  if (!silent) {
    loading = true;
    error = null;
    errorIsConnection = false;
  }
  try {
    const [e, m, c, cfg] = await Promise.allSettled([
      api.getEntries(),
      api.getMaster(),
      api.getCategories(),
      api.getConfig(),
    ]);
    if (e.status === 'fulfilled') entries = e.value;
    if (m.status === 'fulfilled') master = m.value;
    if (c.status === 'fulfilled') categories = c.value;
    if (cfg.status === 'fulfilled') config = cfg.value;

    const failure = [e, m, c].find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failure) {
      if (!silent) {
        error = failure.reason instanceof Error ? failure.reason.message : String(failure.reason);
        errorIsConnection = isQueueable(failure.reason);
      }
      return;
    }

    engine.injectQueue();
    localIds = getLocalEntryIds();
    saveSnapshot({ entries, master, categories, config });
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
  showToast: (msgOrErr, variant = 'default') => toast.show(msgOrErr, undefined, variant),
  clearToast: () => toast.dismiss(),
  syncLocalIds: () => { localIds = getLocalEntryIds(); },
  refreshAll: () => refreshAll(true),
};

const mutApi: MutationApi = {
  addEntry: (payload) => api.addEntry(payload),
  updateEntry: (id, patch) => api.updateEntry(id, patch),
  deleteEntry: (id) => api.deleteEntry(id),
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
  const cache = loadSnapshot();
  if (cache) {
    entries = cache.entries;
    master = cache.master;
    categories = cache.categories;
    if (cache.config) config = cache.config;
    engine.injectQueue();
    localIds = getLocalEntryIds();
    syncing = true;
    masterLoading = true;
    void refreshAll(true).finally(() => {
      syncing = false;
      masterLoading = false;
    });
  } else {
    await refreshAll(false);
    engine.injectQueue();
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
};
