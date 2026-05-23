import * as api from './api';
import { readCache, writeCache } from './cache';
import { getMainCategory } from './domain';
import { dedupeEntries } from './dedupe';
import type {
  Entry,
  MasterRow,
  CategoryMap,
  SubcategoryBreakdown,
  AddEntryPayload,
  UpdateEntryPatch,
} from './types';

let entries = $state<Entry[]>([]);
let master = $state<MasterRow>({ onHand: 0, budgets: {} });
let categories = $state<CategoryMap>({});
let breakdown = $state<SubcategoryBreakdown>({});
let loading = $state(false);
let error = $state<string | null>(null);
let masterLoading = $state(false);
let toastMsg = $state<string | null>(null);
let pendingIds = $state(new Set<number>());


const MUTATION_TIMEOUT_MS = 15_000;

// Svelte 5 requires full reassignment to trigger reactivity on Set state.
function addPending(id: number): void { pendingIds = new Set([...pendingIds, id]); }
function removePending(id: number): void { pendingIds = new Set([...pendingIds].filter((p) => p !== id)); }

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out.')), MUTATION_TIMEOUT_MS)
    ),
  ]);
}

function showToast(err: unknown): void {
  toastMsg = err instanceof Error ? err.message : 'Something went wrong';
  setTimeout(() => { toastMsg = null; }, 3000);
}

async function refreshAll(silent = false): Promise<void> {
  if (!silent) {
    loading = true;
    error = null;
  }
  try {
    const [e, m, c, b] = await Promise.all([
      api.getEntries(),
      api.getMaster(),
      api.getCategories(),
      api.getSubcategoryBreakdown(),
    ]);
    entries = dedupeEntries(e);
    master = m;
    categories = c;
    breakdown = b;
    writeCache({ entries, master, categories, breakdown });
  } catch (err) {
    if (!silent) error = err instanceof Error ? err.message : String(err);
  } finally {
    if (!silent) loading = false;
  }
}

async function init(): Promise<void> {
  const cache = readCache();
  if (cache) {
    entries = dedupeEntries(cache.entries);
    master = cache.master;
    categories = cache.categories;
    breakdown = cache.breakdown;
    void refreshAll(true);
  } else {
    await refreshAll(false);
  }
}

function addEntry(payload: AddEntryPayload | AddEntryPayload[]): void {
  if (Array.isArray(payload)) {
    masterLoading = true;
    void Promise.all(payload.map((p) => api.addEntry(p)))
      .then(() => { void refreshAll(true); })
      .catch((err) => { showToast(err); })
      .finally(() => { masterLoading = false; });
    return;
  }
  const tempId = -(Date.now());
  const optimistic: Entry = {
    id: tempId,
    mainCategory: getMainCategory(payload.tag, categories),
    ...payload,
  };
  entries = [...entries, optimistic];
  addPending(tempId);
  masterLoading = true;
  void withTimeout(api.addEntry(payload))
    .then((real) => {
      entries = entries.map((e) => (e.id === tempId ? real : e));
      removePending(tempId);
      return refreshAll(true).then(() => { removePending(real.id); });
    })
    .catch((err) => {
      entries = entries.filter((e) => e.id !== tempId);
      removePending(tempId);
      showToast(err);
    })
    .finally(() => {
      masterLoading = false;
    });
}

function updateEntry(id: number, patch: UpdateEntryPatch): void {
  const prev = entries.find((e) => e.id === id);
  if (!prev) return;
  entries = entries.map((e) =>
    e.id === id
      ? { ...e, ...patch, mainCategory: patch.tag ? getMainCategory(patch.tag, categories) : e.mainCategory }
      : e
  );
  addPending(id);
  masterLoading = true;
  void withTimeout(api.updateEntry(id, patch))
    .then(() => { void refreshAll(true); })
    .catch((err) => {
      entries = entries.map((e) => (e.id === id ? prev : e));
      showToast(err);
    })
    .finally(() => {
      removePending(id);
      masterLoading = false;
    });
}

function deleteEntry(id: number): void {
  if (!entries.some((e) => e.id === id)) return;
  addPending(id);
  masterLoading = true;
  void withTimeout(api.deleteEntry(id))
    .then(() => {
      entries = entries.filter((e) => e.id !== id);
      void refreshAll(true);
    })
    .catch((err) => {
      showToast(err);
    })
    .finally(() => {
      removePending(id);
      masterLoading = false;
    });
}

export const store = {
  get entries() { return entries; },
  get master() { return master; },
  get categories() { return categories; },
  get breakdown() { return breakdown; },
  get loading() { return loading; },
  get error() { return error; },
  get masterLoading() { return masterLoading; },
  get toastMsg() { return toastMsg; },
  get pendingIds() { return pendingIds; },
  init,
  refreshAll,
  addEntry,
  updateEntry,
  deleteEntry,
  dismissToast: () => { toastMsg = null; },
};
