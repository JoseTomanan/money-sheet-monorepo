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
  masterLoading = true;
  void api.addEntry(payload)
    .then((real) => {
      entries = entries.map((e) => (e.id === tempId ? real : e));
      void refreshAll(true);
    })
    .catch((err) => {
      entries = entries.filter((e) => e.id !== tempId);
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
  masterLoading = true;
  void api.updateEntry(id, patch)
    .then(() => { void refreshAll(true); })
    .catch((err) => {
      entries = entries.map((e) => (e.id === id ? prev : e));
      showToast(err);
    })
    .finally(() => { masterLoading = false; });
}

function deleteEntry(id: number): void {
  const prev = entries.find((e) => e.id === id);
  const idx = entries.findIndex((e) => e.id === id);
  if (!prev) return;
  entries = entries.filter((e) => e.id !== id);
  masterLoading = true;
  void api.deleteEntry(id)
    .then(() => { void refreshAll(true); })
    .catch((err) => {
      entries = [...entries.slice(0, idx), prev, ...entries.slice(idx)];
      showToast(err);
    })
    .finally(() => { masterLoading = false; });
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
  init,
  refreshAll,
  addEntry,
  updateEntry,
  deleteEntry,
  dismissToast: () => { toastMsg = null; },
};
