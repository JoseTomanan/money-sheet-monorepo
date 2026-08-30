import { gateway, isAuthError, isQueueable } from './api';
import { loadSnapshot, saveSnapshot } from './cacheSync';
import { toast } from './toast.svelte';
import { buildEntry, getMainCategory } from './domain';
import { drain, getLocalEntryIds, isQueuedAddId, submitAdd, submitAddBatch, submitDelete, submitEdit } from './offlineMutation';
import { createMutationId } from './mutationId';
import { readQueue } from './queue';
import type {
  Entry,
  MasterRow,
  CategoryMap,
  Config,
  StatsData,
  AddEntryPayload,
  UpdateEntryPatch,
} from './types';

let entries = $state<Entry[]>([]);
let master = $state<MasterRow>({ onHand: 0, budgets: {} });
let categories = $state<CategoryMap>({});
let config = $state<Config>({ currency: "₱" });
let stats = $state<StatsData>({ categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] });
let loading = $state(false);
let error = $state<string | null>(null);
let errorIsConnection = $state(false);
let masterLoading = $state(false);
let pendingIds = $state(new Set<number>());
let deletePendingIds = $state(new Set<number>());
let localIds = $state<Set<number>>(getLocalEntryIds());
let draining = $state(false);
let syncing = $state(false);
let nextTemporaryId = -1;

const QUEUED_ADD_FROZEN_MESSAGE = "This entry is waiting to sync — sync it first, then try again.";

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
    const [e, m, c, cfg, st] = await Promise.allSettled([
      gateway().getEntries(),
      gateway().getMaster(),
      gateway().getCategories(),
      gateway().getConfig(),
      gateway().getStats(),
    ]);
    if (e.status === 'fulfilled') entries = e.value;
    if (m.status === 'fulfilled') master = m.value;
    if (c.status === 'fulfilled') categories = c.value;
    if (cfg.status === 'fulfilled') config = cfg.value;
    // Stats is a non-fatal read, same spirit as master/config: a failure here
    // degrades gracefully (envelope rows just miss direction/pace data) rather
    // than gating the connection-error state below.
    if (st.status === 'fulfilled') stats = st.value;

    const failure = [e, m, c].find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (failure) {
      if (!silent) {
        error = failure.reason instanceof Error ? failure.reason.message : String(failure.reason);
        errorIsConnection = isQueueable(failure.reason);
      }
      return;
    }

    injectQueue();
    localIds = getLocalEntryIds();
    saveSnapshot({ entries, master, categories, config, stats });
  } finally {
    if (!silent) loading = false;
  }
}

function replaceEntry(id: number, next: Entry): void {
  entries = entries.map((entry) => entry.id === id ? next : entry);
}

function syncLocalIds(): void {
  localIds = getLocalEntryIds();
}

function reserveRehydratedTemporaryIds(): void {
  const restoredIds = entries.filter((entry) => entry.id < 0).map((entry) => entry.id);
  if (restoredIds.length > 0) {
    nextTemporaryId = Math.min(nextTemporaryId, Math.min(...restoredIds) - 1);
  }
}

async function add(payload: AddEntryPayload): Promise<boolean> {
  const tempId = nextTemporaryId--;
  const mutationId = createMutationId();
  entries = [...entries, buildEntry(tempId, payload, categories)];
  addPending(tempId);
  masterLoading = true;
  try {
    const outcome = await submitAdd(tempId, payload, mutationId, () => gateway().addEntry(payload, mutationId));
    removePending(tempId);
    if (outcome.status === 'confirmed') {
      replaceEntry(tempId, outcome.entry);
      addPending(outcome.entry.id);
      await refreshAll(true);
      removePending(outcome.entry.id);
    } else if (outcome.status === 'queued') {
      syncLocalIds();
      if (isAuthError(outcome.error)) toast.show(outcome.error, undefined, 'destructive');
    } else {
      entries = entries.filter((entry) => entry.id !== tempId);
      toast.show(outcome.error, undefined, 'destructive');
      return false;
    }
    return true;
  } finally {
    masterLoading = false;
  }
}

async function addLegs(legs: AddEntryPayload[]): Promise<boolean> {
  const tempIds = legs.map(() => nextTemporaryId--);
  const mutationId = createMutationId();
  entries = [...entries, ...legs.map((leg, index) => buildEntry(tempIds[index], leg, categories))];
  for (const id of tempIds) addPending(id);
  masterLoading = true;
  try {
    const outcome = await submitAddBatch(tempIds, legs, mutationId, () => gateway().addEntries(legs, mutationId));
    for (const id of tempIds) removePending(id);

    if (outcome.status === 'confirmed') {
      for (let index = 0; index < tempIds.length; index++) replaceEntry(tempIds[index], outcome.entries[index]);
    }
    syncLocalIds();

    if (outcome.status === 'queued' && isAuthError(outcome.error)) {
      toast.show(outcome.error, undefined, 'destructive');
    } else if (outcome.status === 'confirmed') {
      toast.dismiss();
    } else if (outcome.status === 'failed') {
      entries = entries.filter((entry) => !tempIds.includes(entry.id));
      toast.show(outcome.error, undefined, 'destructive');
      return false;
    }
    await refreshAll(true);
    return true;
  } finally {
    masterLoading = false;
  }
}

function addEntry(payload: AddEntryPayload | AddEntryPayload[]): Promise<boolean> {
  return Array.isArray(payload) ? addLegs(payload) : add(payload);
}

async function updateEntry(id: number, patch: UpdateEntryPatch): Promise<boolean> {
  const previous = entries.find((entry) => entry.id === id);
  if (!previous) return false;
  if (isQueuedAddId(id)) {
    toast.show(QUEUED_ADD_FROZEN_MESSAGE);
    return false;
  }
  const optimistic: Entry = {
    ...previous,
    ...patch,
    mainCategory: patch.tag ? getMainCategory(patch.tag, categories) : previous.mainCategory,
  };
  replaceEntry(id, optimistic);
  addPending(id);
  masterLoading = true;
  try {
    const outcome = await submitEdit(id, patch, () => gateway().updateEntry(id, patch));
    if (outcome.status === 'confirmed') {
      await refreshAll(true);
    } else if (outcome.status === 'queued') {
      syncLocalIds();
      if (isAuthError(outcome.error)) toast.show(outcome.error, undefined, 'destructive');
    } else {
      replaceEntry(id, previous);
      toast.show(outcome.error);
      return false;
    }
    return true;
  } finally {
    removePending(id);
    masterLoading = false;
  }
}

async function deleteEntry(id: number): Promise<boolean> {
  if (!entries.some((entry) => entry.id === id)) return false;
  if (isQueuedAddId(id)) {
    toast.show(QUEUED_ADD_FROZEN_MESSAGE);
    return false;
  }
  const wasLocal = getLocalEntryIds().has(id);
  addDeletePending(id);
  masterLoading = true;
  try {
    const outcome = await submitDelete(id, () => gateway().deleteEntry(id));
    if (outcome.status === 'confirmed') {
      entries = entries.filter((entry) => entry.id !== id);
      await refreshAll(true);
    } else if (outcome.status === 'queued') {
      syncLocalIds();
      if (wasLocal) entries = entries.filter((entry) => entry.id !== id);
      if (isAuthError(outcome.error)) toast.show(outcome.error, undefined, 'destructive');
    } else {
      toast.show(outcome.error);
      return false;
    }
    return true;
  } finally {
    removeDeletePending(id);
    masterLoading = false;
  }
}

async function deleteEntries(ids: number[]): Promise<void> {
  const present = ids.filter((id) => entries.some((entry) => entry.id === id));
  if (present.length === 0) return;

  const frozen = present.filter((id) => isQueuedAddId(id));
  const deletable = present.filter((id) => !isQueuedAddId(id));
  if (frozen.length > 0) toast.show(QUEUED_ADD_FROZEN_MESSAGE);
  if (deletable.length === 0) return;

  const currentLocalIds = getLocalEntryIds();
  const localToDelete = deletable.filter((id) => currentLocalIds.has(id));
  for (const id of localToDelete) {
    await submitDelete(id, () => Promise.resolve());
    entries = entries.filter((entry) => entry.id !== id);
  }
  syncLocalIds();

  const remote = deletable.filter((id) => !currentLocalIds.has(id));
  if (remote.length === 0) return;

  for (const id of remote) addDeletePending(id);
  masterLoading = true;
  try {
    const outcomes = await Promise.allSettled(remote.map((id) => submitDelete(id, () => gateway().deleteEntry(id))));
    const removed: number[] = [];
    let failCount = 0;
    for (let index = 0; index < outcomes.length; index++) {
      const result = outcomes[index];
      if (result.status !== 'fulfilled') continue;
      if (result.value.status === 'confirmed') {
        removed.push(remote[index]);
      } else if (result.value.status === 'queued') {
        if (isAuthError(result.value.error)) toast.show(result.value.error, undefined, 'destructive');
      } else {
        failCount++;
      }
    }
    syncLocalIds();
    if (removed.length > 0) entries = entries.filter((entry) => !removed.includes(entry.id));
    if (failCount > 0) toast.show(`Failed to delete ${failCount} entr${failCount === 1 ? 'y' : 'ies'}.`);
    await refreshAll(true);
  } finally {
    for (const id of remote) removeDeletePending(id);
    masterLoading = false;
  }
}

async function drainQueue(): Promise<void> {
  if (draining || getLocalEntryIds().size === 0) return;
  draining = true;
  try {
    const results = await drain({
      add: (payload, mutationId) => gateway().addEntry(payload, mutationId),
      addEntries: (payloads, mutationId) => gateway().addEntries(payloads, mutationId),
      edit: (id, patch) => gateway().updateEntry(id, patch),
      delete: (id) => gateway().deleteEntry(id),
    });
    for (const result of results) {
      if (result.status === 'drained') {
        const item = result.item;
        if (item.op === 'add') {
          replaceEntry(item.tempId, result.entry!);
        } else if (item.op === 'addBatch') {
          for (let index = 0; index < item.tempIds.length; index++) {
            replaceEntry(item.tempIds[index], result.entries![index]);
          }
        } else if (item.op === 'delete') {
          entries = entries.filter((entry) => entry.id !== item.id);
        }
      } else if (isAuthError(result.error)) {
        toast.show(result.error, undefined, 'destructive');
      }
    }
    syncLocalIds();
    if (results.length > 0 && results.every((result) => result.status === 'drained')) await refreshAll(true);
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
    if (cache.stats) stats = cache.stats;
    injectQueue();
    localIds = getLocalEntryIds();
    syncing = true;
    masterLoading = true;
    void refreshAll(true).finally(() => {
      syncing = false;
      masterLoading = false;
    });
  } else {
    await refreshAll(false);
    injectQueue();
    localIds = getLocalEntryIds();
  }
  window.addEventListener('online', () => void drainQueue());
}

function injectQueue(): void {
  for (const item of readQueue()) {
    if (item.op === 'add') {
      if (!entries.some((entry) => entry.id === item.tempId)) {
        entries = [...entries, buildEntry(item.tempId, item.payload, categories)];
      }
    } else if (item.op === 'addBatch') {
      for (let index = 0; index < item.tempIds.length; index++) {
        if (!entries.some((entry) => entry.id === item.tempIds[index])) {
          entries = [...entries, buildEntry(item.tempIds[index], item.payloads[index], categories)];
        }
      }
    } else if (item.op === 'edit') {
      const previous = entries.find((entry) => entry.id === item.id);
      if (previous) {
        replaceEntry(item.id, {
          ...previous,
          ...item.patch,
          mainCategory: item.patch.tag ? getMainCategory(item.patch.tag, categories) : previous.mainCategory,
        });
      }
    }
  }
  reserveRehydratedTemporaryIds();
}

export const store = {
  get entries() { return entries; },
  get master() { return master; },
  get categories() { return categories; },
  get config() { return config; },
  get stats() { return stats; },
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
