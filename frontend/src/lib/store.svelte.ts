import * as api from './api';
import { ConnectionError } from './api';
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
let errorIsConnection = $state(false);
let masterLoading = $state(false);
let toastMsg = $state<string | null>(null);
let toastAction = $state<{ label: string; run: () => void } | null>(null);
let toastIsConnection = $state(false);
let pendingIds = $state(new Set<number>());
let failedIds = $state(new Set<number>());
let syncing = $state(false);


const REQUEST_TIMEOUT_MS = 15_000;

// Svelte 5 requires full reassignment to trigger reactivity on Set state.
function addPending(id: number): void { pendingIds = new Set([...pendingIds, id]); }
function removePending(id: number): void { pendingIds = new Set([...pendingIds].filter((p) => p !== id)); }
function addFailed(id: number): void { failedIds = new Set([...failedIds, id]); }
function removeFailed(id: number): void { failedIds = new Set([...failedIds].filter((p) => p !== id)); }

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

function submitLegs(legs: AddEntryPayload[]): void {
  masterLoading = true;
  void Promise.allSettled(legs.map((p) => withTimeout(api.addEntry(p))))
    .then((results) => {
      const failed = legs.filter((_, i) => results[i].status === 'rejected');
      const ok = legs.length - failed.length;
      if (failed.length === 0) {
        toastMsg = null;
        toastAction = null;
      } else if (ok === 0) {
        showToast("Couldn't save entries", { label: 'Retry', run: () => submitLegs(failed) });
      } else {
        showToast(`Saved ${ok} of ${legs.length} entries`, { label: 'Retry', run: () => submitLegs(failed) });
      }
      return refreshAll(true);
    })
    .finally(() => { masterLoading = false; });
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
    const failedEntries = entries.filter((e) => failedIds.has(e.id));
    entries = dedupeEntries(e);
    for (const fe of failedEntries) {
      if (!entries.some((en) => en.id === fe.id)) entries = [...entries, fe];
    }
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

function addEntry(payload: AddEntryPayload | AddEntryPayload[]): void {
  if (Array.isArray(payload)) {
    submitLegs(payload);
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
    .catch(() => {
      addFailed(tempId);
      removePending(tempId);
      // entry stays in list; the card shows the error state — no toast needed
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
    .then(() => refreshAll(true))
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
      return refreshAll(true);
    })
    .catch((err) => {
      showToast(err);
    })
    .finally(() => {
      removePending(id);
      masterLoading = false;
    });
}

function retryEntry(id: number): void {
  const fe = entries.find((e) => e.id === id);
  if (!fe) return;
  const payload: AddEntryPayload = {
    date: fe.date,
    tag: fe.tag,
    description: fe.description,
    direction: fe.direction,
    amount: fe.amount,
  };
  removeFailed(id);
  addPending(id);
  masterLoading = true;
  void withTimeout(api.addEntry(payload))
    .then((real) => {
      entries = entries.map((e) => (e.id === id ? real : e));
      removePending(id);
      return refreshAll(true).then(() => { removePending(real.id); });
    })
    .catch(() => {
      addFailed(id);
      removePending(id);
    })
    .finally(() => { masterLoading = false; });
}

function dismissFailedEntry(id: number): void {
  entries = entries.filter((e) => e.id !== id);
  removeFailed(id);
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
  get failedIds() { return failedIds; },
  get syncing() { return syncing; },
  init,
  refreshAll,
  addEntry,
  updateEntry,
  deleteEntry,
  retryEntry,
  dismissFailedEntry,
  dismissToast: () => { toastMsg = null; toastAction = null; toastIsConnection = false; },
};
