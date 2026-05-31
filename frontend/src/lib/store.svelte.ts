import * as api from './api';
import { ConnectionError } from './api';
import { readCache, writeCache } from './cache';
import { getMainCategory, buildEntry } from './domain';
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
let errorIsConnection = $state(false);
let masterLoading = $state(false);
let toastMsg = $state<string | null>(null);
let toastAction = $state<{ label: string; run: () => void } | null>(null);
let toastIsConnection = $state(false);
let pendingIds = $state(new Set<number>());
let syncing = $state(false);


const REQUEST_TIMEOUT_MS = 15_000;

// Svelte 5 requires full reassignment to trigger reactivity on Set state.
function addPending(id: number): void { pendingIds = new Set([...pendingIds, id]); }
function removePending(id: number): void { pendingIds = new Set([...pendingIds].filter((p) => p !== id)); }

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out.')), REQUEST_TIMEOUT_MS)
    ),
  ]);
}

function showToast(msgOrErr: unknown, action?: { label: string; run: () => void }): void {
  toastMsg = msgOrErr instanceof Error ? msgOrErr.message : String(msgOrErr);
  toastAction = action ?? null;
  toastIsConnection = msgOrErr instanceof ConnectionError;
  if (!action) {
    setTimeout(() => { toastMsg = null; toastIsConnection = false; }, 3000);
  }
}

async function submitLegs(legs: AddEntryPayload[]): Promise<void> {
  const now = Date.now();
  const tempIds = legs.map((_, i) => -(now + i));
  entries = [...entries, ...legs.map((leg, i) => buildEntry(tempIds[i], leg, categories))];
  for (const id of tempIds) addPending(id);
  masterLoading = true;
  try {
    const results = await Promise.allSettled(legs.map((p) => withTimeout(api.addEntry(p))));
    const failed = legs.filter((_, i) => results[i].status === 'rejected');
    const ok = legs.length - failed.length;

    for (let i = 0; i < results.length; i++) {
      const tempId = tempIds[i];
      removePending(tempId);
      if (results[i].status === 'fulfilled') {
        const real = (results[i] as PromiseFulfilledResult<Entry>).value;
        entries = entries.map((e) => (e.id === tempId ? real : e));
      } else {
        entries = entries.filter((e) => e.id !== tempId);
      }
    }

    if (failed.length === 0) {
      toastMsg = null;
      toastAction = null;
    } else if (ok === 0) {
      showToast("Couldn't save entries", { label: 'Retry', run: () => void submitLegs(failed) });
    } else {
      showToast(`Saved ${ok} of ${legs.length} entries`, { label: 'Retry', run: () => void submitLegs(failed) });
    }
    await refreshAll(true);
  } finally {
    masterLoading = false;
  }
}

async function refreshAll(silent = false): Promise<void> {
  if (!silent) {
    loading = true;
    error = null;
    errorIsConnection = false;
  }
  try {
    const [e, m, c, b] = await withTimeout(Promise.all([
      api.getEntries(),
      api.getMaster(),
      api.getCategories(),
      api.getSubcategoryBreakdown(),
    ]));
    entries = e;
    master = m;
    categories = c;
    breakdown = b;
    writeCache({ entries, master, categories, breakdown });
  } catch (err) {
    if (!silent) {
      error = err instanceof Error ? err.message : String(err);
      errorIsConnection = err instanceof ConnectionError;
    }
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
    syncing = true;
    masterLoading = true;
    void refreshAll(true).finally(() => {
      syncing = false;
      masterLoading = false;
    });
  } else {
    await refreshAll(false);
  }
}

async function addSingle(payload: AddEntryPayload): Promise<void> {
  const tempId = -(Date.now());
  entries = [...entries, buildEntry(tempId, payload, categories)];
  addPending(tempId);
  masterLoading = true;
  try {
    const real = await withTimeout(api.addEntry(payload));
    entries = entries.map((e) => (e.id === tempId ? real : e));
    removePending(tempId);
    addPending(real.id);
    await refreshAll(true);
    removePending(real.id);
  } catch (err) {
    entries = entries.filter((e) => e.id !== tempId);
    removePending(tempId);
    showToast(err);
  } finally {
    masterLoading = false;
  }
}

function addEntry(payload: AddEntryPayload | AddEntryPayload[]): Promise<void> {
  return Array.isArray(payload) ? submitLegs(payload) : addSingle(payload);
}

async function updateEntry(id: number, patch: UpdateEntryPatch): Promise<void> {
  const prev = entries.find((e) => e.id === id);
  if (!prev) return;
  entries = entries.map((e) =>
    e.id === id
      ? { ...e, ...patch, mainCategory: patch.tag ? getMainCategory(patch.tag, categories) : e.mainCategory }
      : e
  );
  addPending(id);
  masterLoading = true;
  try {
    await withTimeout(api.updateEntry(id, patch));
    await refreshAll(true);
  } catch (err) {
    entries = entries.map((e) => (e.id === id ? prev : e));
    showToast(err);
  } finally {
    removePending(id);
    masterLoading = false;
  }
}

async function deleteEntry(id: number): Promise<void> {
  if (!entries.some((e) => e.id === id)) return;
  addPending(id);
  masterLoading = true;
  try {
    await withTimeout(api.deleteEntry(id));
    entries = entries.filter((e) => e.id !== id);
    await refreshAll(true);
  } catch (err) {
    showToast(err);
  } finally {
    removePending(id);
    masterLoading = false;
  }
}

export const store = {
  get entries() { return entries; },
  get master() { return master; },
  get categories() { return categories; },
  get breakdown() { return breakdown; },
  get loading() { return loading; },
  get error() { return error; },
  get errorIsConnection() { return errorIsConnection; },
  get masterLoading() { return masterLoading; },
  get toastMsg() { return toastMsg; },
  get toastAction() { return toastAction; },
  get toastIsConnection() { return toastIsConnection; },
  get pendingIds() { return pendingIds; },
  get syncing() { return syncing; },
  init,
  refreshAll,
  addEntry,
  updateEntry,
  deleteEntry,
  dismissToast: () => { toastMsg = null; toastAction = null; toastIsConnection = false; },
};
