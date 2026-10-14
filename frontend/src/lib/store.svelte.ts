import { gateway, isAuthError, isQueueable } from './api';
import { loadSnapshot, saveSnapshot } from './cacheSync';
import { toast } from './toast.svelte';
import { buildEntry, getMainCategory } from './domain';
import { drain, getLocalEntryIds, isQueuedAddId, submitAdd, submitAddBatch, submitDelete, submitEdit } from './offlineMutation';
import { readQueue, QueuePersistenceError } from './queue';
import type { QueueItem } from './queue';
import { compareEntriesForDisplay } from './groupEntries';
import type {
  Entry,
  MasterRow,
  CategoryMap,
  Config,
  StatsData,
  AddEntryPayload,
  UpdateEntryPatch,
  EntrySubmission,
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
let localIds = $state<Set<number>>(new Set());
let draining = $state(false);
let syncing = $state(false);
let nextTemporaryId = -1;
// Discard snapshots begun before an operation changed or settled. Pending
// rows are overlaid on snapshots begun during the operation below.
let mutationRevision = 0;
let refreshSequence = 0;
const confirmedEditIds = new Set<number>();

const QUEUED_ADD_FROZEN_MESSAGE = "This entry is waiting to sync — sync it first, then try again.";

function notifyQueuedError(error: unknown): void {
  if (isAuthError(error) || error instanceof QueuePersistenceError) toast.show(error, undefined, 'destructive');
}

function queueReadable(): boolean {
  try { readQueue(); return true; }
  catch (error) { toast.show(error, undefined, 'destructive'); return false; }
}

function mutationInFlight(id: number): boolean {
  return pendingIds.has(id) || deletePendingIds.has(id) || (draining && localIds.has(id));
}

interface RefreshFailure {
  label: string;
  rejection: PromiseRejectedResult;
}

function rejectionMessage(rejection: PromiseRejectedResult): string {
  return rejection.reason instanceof Error ? rejection.reason.message : String(rejection.reason);
}

function isRejected<T>(result: PromiseSettledResult<T>): result is PromiseRejectedResult {
  return result.status === 'rejected';
}

function notifyRefreshFailures(failures: RefreshFailure[]): void {
  const message = `Not updated: ${failures.map(({ label }) => label).join(', ')}.`;
  toast.show(message, {
    label: 'Retry',
    run: () => {
      toast.dismiss();
      void refreshAll();
    },
  }, 'destructive', {
    heading: "Couldn't refresh your data",
    isConnection: failures.some(({ rejection }) => isQueueable(rejection.reason)),
  });
}

function handleCoreRefreshFailures(
  failures: RefreshFailure[],
  silent: boolean,
): void {
  if (!silent) {
    error = rejectionMessage(failures[0].rejection);
    errorIsConnection = isQueueable(failures[0].rejection.reason);
  }
  notifyRefreshFailures(failures);
}

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
  const revision = mutationRevision;
  const sequence = ++refreshSequence;
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
    // Entries, MASTER, and Categories form one financial snapshot. Never
    // combine a fresh subset with a previous MASTER value: that can make an
    // entry list and its displayed balances contradict each other.
    const coreFailures: RefreshFailure[] = [];
    if (isRejected(e)) coreFailures.push({ label: 'entries', rejection: e });
    if (isRejected(m)) coreFailures.push({ label: 'balances', rejection: m });
    if (isRejected(c)) coreFailures.push({ label: 'categories', rejection: c });
    const optionalFailures: RefreshFailure[] = [];
    if (isRejected(cfg)) optionalFailures.push({ label: 'settings', rejection: cfg });
    if (isRejected(st)) optionalFailures.push({ label: 'statistics', rejection: st });
    if (coreFailures.length > 0) {
      handleCoreRefreshFailures([...coreFailures, ...optionalFailures], silent);
      return;
    }
    // The rejection checks above make this unreachable, while narrowing the
    // settled-result union for TypeScript before reading the values below.
    if (e.status !== 'fulfilled' || m.status !== 'fulfilled' || c.status !== 'fulfilled') return;
    if (sequence !== refreshSequence) return;
    if (revision !== mutationRevision) {
      // The latest refresh still owes a coherent snapshot after an overlapping
      // operation settles. Read again rather than accepting its stale response.
      await refreshAll(true);
      return;
    }

    // An unreadable queue must not let a server refresh erase known pending UI.
    const queue = readQueue();
    const pendingEntries = entries.filter(entry => pendingIds.has(entry.id) && !confirmedEditIds.has(entry.id));
    entries = e.value;
    master = m.value;
    categories = c.value;
    if (cfg.status === 'fulfilled') config = cfg.value;
    if (st.status === 'fulfilled') stats = st.value;

    if (optionalFailures.length > 0) notifyRefreshFailures(optionalFailures);

    injectQueue(queue);
    const optimisticById = new Map(pendingEntries.map(entry => [entry.id, entry]));
    entries = entries.map(entry => optimisticById.get(entry.id) ?? entry);
    entries = [...entries, ...pendingEntries.filter(entry => !entries.some(current => current.id === entry.id))]
      .filter(entry => !deletePendingIds.has(entry.id));
    syncLocalIds();
    saveSnapshot({ entries, master, categories, config, stats });
  } catch (cause) {
    toast.show(cause, undefined, 'destructive');
    if (!silent) { error = cause instanceof Error ? cause.message : String(cause); errorIsConnection = isQueueable(cause); }
  } finally {
    if (!silent) loading = false;
  }
}

function replaceEntry(id: number, next: Entry): void {
  entries = entries.map((entry) => entry.id === id ? next : entry);
}

function syncLocalIds(): void {
  try { localIds = getLocalEntryIds(); }
  catch (error) { toast.show(error, undefined, 'destructive'); }
}

function reserveRehydratedTemporaryIds(): void {
  const restoredIds = entries.filter((entry) => entry.id < 0).map((entry) => entry.id);
  if (restoredIds.length > 0) {
    nextTemporaryId = Math.min(nextTemporaryId, Math.min(...restoredIds) - 1);
  }
}

async function add(payload: AddEntryPayload): Promise<boolean> {
  const tempId = nextTemporaryId--;
  entries = [...entries, buildEntry(tempId, payload, categories)];
  addPending(tempId);
  masterLoading = true;
  try {
    const outcome = await submitAdd(tempId, payload, (saved, key) => gateway().addEntry(saved, key));
    removePending(tempId);
    if (outcome.status === 'confirmed') {
      replaceEntry(tempId, outcome.entry);
      addPending(outcome.entry.id);
      await refreshAll(true);
      removePending(outcome.entry.id);
    } else if (outcome.status === 'queued') {
      syncLocalIds();
      notifyQueuedError(outcome.error);
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
  entries = [...entries, ...legs.map((leg, index) => buildEntry(tempIds[index], leg, categories))];
  for (const id of tempIds) addPending(id);
  masterLoading = true;
  try {
    const outcome = await submitAddBatch(tempIds, legs, (saved, key) => gateway().addEntries(saved, key));
    for (const id of tempIds) removePending(id);

    if (outcome.status === 'confirmed') {
      for (let index = 0; index < tempIds.length; index++) replaceEntry(tempIds[index], outcome.entries[index]);
    }
    syncLocalIds();

    if (outcome.status === 'queued') {
      notifyQueuedError(outcome.error);
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
  if (!queueReadable()) return false;
  if (mutationInFlight(id)) return false;
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
  mutationRevision++;
  addPending(id);
  masterLoading = true;
  try {
    const outcome = await submitEdit(id, patch, (savedId, savedPatch) => gateway().updateEntry(savedId, savedPatch));
    if (outcome.status === 'confirmed') {
      confirmedEditIds.add(id);
      mutationRevision++;
      await refreshAll(true);
    } else if (outcome.status === 'queued') {
      syncLocalIds();
      notifyQueuedError(outcome.error);
    } else {
      replaceEntry(id, previous);
      toast.show(outcome.error, undefined, 'destructive');
      return false;
    }
    return true;
  } finally {
    removePending(id);
    confirmedEditIds.delete(id);
    mutationRevision++;
    masterLoading = false;
  }
}

function submitUpdateEntry(id: number, patch: UpdateEntryPatch): EntrySubmission {
  const accepted = entries.some(entry => entry.id === id)
    && queueReadable() && !mutationInFlight(id) && !isQueuedAddId(id);
  // updateEntry also reports the existing frozen-entry notification when blocked.
  return { accepted, completion: updateEntry(id, patch) };
}

async function deleteEntry(id: number): Promise<boolean> {
  if (!queueReadable()) return false;
  if (mutationInFlight(id)) return false;
  const previous = entries.find((entry) => entry.id === id);
  if (!previous) return false;
  if (isQueuedAddId(id)) {
    toast.show(QUEUED_ADD_FROZEN_MESSAGE);
    return false;
  }
  entries = entries.filter((entry) => entry.id !== id);
  mutationRevision++;
  addDeletePending(id);
  masterLoading = true;
  try {
    const outcome = await submitDelete(id, savedId => gateway().deleteEntry(savedId));
    if (outcome.status === 'confirmed') {
      entries = entries.filter((entry) => entry.id !== id);
      await refreshAll(true);
    } else if (outcome.status === 'queued') {
      syncLocalIds();
      notifyQueuedError(outcome.error);
    } else {
      entries = [...entries.filter(entry => entry.id !== id), previous].sort(compareEntriesForDisplay);
      toast.show(outcome.error, undefined, 'destructive');
      return false;
    }
    return true;
  } finally {
    removeDeletePending(id);
    mutationRevision++;
    masterLoading = false;
  }
}

async function deleteEntries(ids: number[]): Promise<void> {
  if (!queueReadable()) return;
  const present = [...new Set(ids)].filter((id) => entries.some((entry) => entry.id === id)
    && !mutationInFlight(id));
  if (present.length === 0) return;

  const frozen = present.filter((id) => isQueuedAddId(id));
  const deletable = present.filter((id) => !isQueuedAddId(id));
  if (frozen.length > 0) toast.show(QUEUED_ADD_FROZEN_MESSAGE);
  if (deletable.length === 0) return;

  const previous = new Map(entries.filter(entry => deletable.includes(entry.id)).map(entry => [entry.id, entry]));
  const retainedPendingIds = new Set(deletable);
  entries = entries.filter(entry => !previous.has(entry.id));
  for (const id of deletable) addDeletePending(id);
  mutationRevision++;
  masterLoading = true;
  try {
    let failCount = 0;
    await Promise.all(deletable.map(async id => {
      const outcome = await submitDelete(id, savedId => gateway().deleteEntry(savedId));
      if (outcome.status === 'failed') {
        entries = [...entries.filter(entry => entry.id !== id), previous.get(id)!].sort(compareEntriesForDisplay);
        removeDeletePending(id);
        retainedPendingIds.delete(id);
        mutationRevision++;
        failCount++;
      } else if (outcome.status === 'queued') {
        notifyQueuedError(outcome.error);
      }
      syncLocalIds();
    }));
    syncLocalIds();
    if (failCount > 0) toast.show(`Failed to delete ${failCount} entr${failCount === 1 ? 'y' : 'ies'}.`, undefined, 'destructive');
    await refreshAll(true);
  } finally {
    for (const id of retainedPendingIds) removeDeletePending(id);
    mutationRevision++;
    masterLoading = false;
  }
}

async function drainQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  mutationRevision++;
  try {
    if (getLocalEntryIds().size === 0) return;
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
      } else if (isAuthError(result.error) || !isQueueable(result.error)) {
        toast.show(result.error, undefined, 'destructive');
      }
    }
    syncLocalIds();
    mutationRevision++;
    if (results.length > 0 && results.every((result) => result.status === 'drained')) await refreshAll(true);
  } catch (error) {
    toast.show(error, undefined, 'destructive');
  } finally {
    draining = false;
    mutationRevision++;
  }
}

async function init(): Promise<void> {
  try {
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
  } catch (error) {
    toast.show(error, undefined, 'destructive');
  }
}

function injectQueue(queue: QueueItem[] = readQueue()): void {
  for (const item of queue) {
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
    } else if (item.op === 'delete') {
      entries = entries.filter(entry => entry.id !== item.id);
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
  get masterLoading() { return masterLoading || pendingIds.size > 0 || deletePendingIds.size > 0; },
  get pendingIds() { return pendingIds; },
  get deletePendingIds() { return deletePendingIds; },
  get localIds() { return localIds; },
  get draining() { return draining; },
  get syncing() { return syncing; },
  init,
  refreshAll,
  addEntry,
  updateEntry,
  submitUpdateEntry,
  deleteEntry,
  deleteEntries,
  drainQueue,
};
