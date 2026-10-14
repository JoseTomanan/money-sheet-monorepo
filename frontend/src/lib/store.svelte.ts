import { connection, mockMode, onConnectionChange } from './connection.svelte';
import { captureGateway, isAuthError, isQueueable } from './api';
import { loadSnapshot, saveSnapshot } from './cacheSync';
import { toast } from './toast.svelte';
import { buildEntry, getMainCategory } from './domain';
import { queueFor, QueuePersistenceError, hasLegacyWork, associateLegacyWork } from './queue';
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

let lifetime = 0;
let initialized = false;
function activeScope() { return mockMode.current ? null : connection.current?.gasUrl ?? null; }
function readQueue() { return queueFor(activeScope()).readQueue(); }
function getLocalEntryIds() { return queueFor(activeScope()).getLocalEntryIds(); }
function isQueuedAddId(id: number) { return queueFor(activeScope()).isQueuedAddId(id); }
function session() {
  const generation = lifetime;
  const scope = activeScope();
  return { scope, api: captureGateway(), queue: queueFor(scope), current: () => generation === lifetime };
}
function activate() {
  lifetime++;
  refreshSequence++;
  mutationRevision++;
  entries = []; master = { onHand: 0, budgets: {} }; categories = {};
  config = { currency: '\u20b1' };
  stats = { categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] };
  pendingIds = new Set(); deletePendingIds = new Set(); localIds = new Set();
  confirmedEditIds.clear();
  loading = false; error = null; errorIsConnection = false;
  masterLoading = false; draining = false; syncing = false; nextTemporaryId = -1;
  toast.dismiss();
  void init();
}
onConnectionChange(activate);

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
  const owner = session();
  const revision = mutationRevision;
  const sequence = ++refreshSequence;
  if (!silent) {
    loading = true;
    error = null;
    errorIsConnection = false;
  }
  try {
    const [e, m, c, cfg, st] = await Promise.allSettled([
      owner.api.getEntries(),
      owner.api.getMaster(),
      owner.api.getCategories(),
      owner.api.getConfig(),
      owner.api.getStats(),
    ]);
    if (!owner.current() || sequence !== refreshSequence) return;
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
    saveSnapshot({ entries, master, categories, config, stats }, owner.scope);
  } catch (cause) {
    if (!owner.current()) return;
    toast.show(cause, undefined, 'destructive');
    if (!silent) { error = cause instanceof Error ? cause.message : String(cause); errorIsConnection = isQueueable(cause); }
  } finally {
    if (owner.current() && sequence === refreshSequence && !silent) loading = false;
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
  const owner = session();
  const tempId = nextTemporaryId--;
  entries = [...entries, buildEntry(tempId, payload, categories)];
  addPending(tempId);
  masterLoading = true;
  try {
    const outcome = await owner.queue.submitAdd(tempId, payload, (saved, key) => owner.api.addEntry(saved, key));
    if (!owner.current()) return false;
    removePending(tempId);
    if (outcome.status === 'confirmed') {
      replaceEntry(tempId, outcome.entry);
      addPending(outcome.entry.id);
      await refreshAll(true);
      if (!owner.current()) return false;
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
    if (owner.current()) {
      masterLoading = false;
    }
  }
}

async function addLegs(legs: AddEntryPayload[]): Promise<boolean> {
  const owner = session();
  const tempIds = legs.map(() => nextTemporaryId--);
  entries = [...entries, ...legs.map((leg, index) => buildEntry(tempIds[index], leg, categories))];
  for (const id of tempIds) addPending(id);
  masterLoading = true;
  try {
    const outcome = await owner.queue.submitAddBatch(tempIds, legs, (saved, key) => owner.api.addEntries(saved, key));
    if (!owner.current()) return false;
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
    if (owner.current()) {
      masterLoading = false;
    }
  }
}

function addEntry(payload: AddEntryPayload | AddEntryPayload[]): Promise<boolean> {
  return Array.isArray(payload) ? addLegs(payload) : add(payload);
}

async function updateEntry(id: number, patch: UpdateEntryPatch): Promise<boolean> {
  const owner = session();
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
    const outcome = await owner.queue.submitEdit(id, patch, (savedId, savedPatch) => owner.api.updateEntry(savedId, savedPatch));
    if (!owner.current()) return false;
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
    if (owner.current()) {
      removePending(id);
      confirmedEditIds.delete(id);
      mutationRevision++;
      masterLoading = false;
    }
  }
}

function submitUpdateEntry(id: number, patch: UpdateEntryPatch): EntrySubmission {
  const accepted = entries.some(entry => entry.id === id)
    && queueReadable() && !mutationInFlight(id) && !isQueuedAddId(id);
  // updateEntry also reports the existing frozen-entry notification when blocked.
  return { accepted, completion: updateEntry(id, patch) };
}

async function deleteEntry(id: number): Promise<boolean> {
  const owner = session();
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
    const outcome = await owner.queue.submitDelete(id, savedId => owner.api.deleteEntry(savedId));
    if (!owner.current()) return false;
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
    if (owner.current()) {
      removeDeletePending(id);
      mutationRevision++;
      masterLoading = false;
    }
  }
}

async function deleteEntries(ids: number[]): Promise<void> {
  const owner = session();
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
      const outcome = await owner.queue.submitDelete(id, savedId => owner.api.deleteEntry(savedId));
      if (!owner.current()) return false;
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
    if (!owner.current()) return;
    syncLocalIds();
    if (failCount > 0) toast.show(`Failed to delete ${failCount} entr${failCount === 1 ? 'y' : 'ies'}.`, undefined, 'destructive');
    await refreshAll(true);
  } finally {
    if (owner.current()) {
      for (const id of retainedPendingIds) removeDeletePending(id);
      mutationRevision++;
      masterLoading = false;
    }
  }
}

async function drainQueue(): Promise<void> {
  const owner = session();
  if (draining) return;
  draining = true;
  mutationRevision++;
  try {
    if (getLocalEntryIds().size === 0) return;
    const results = await owner.queue.drain({
      isCurrent: owner.current,
      add: (payload, mutationId) => owner.api.addEntry(payload, mutationId),
      addEntries: (payloads, mutationId) => owner.api.addEntries(payloads, mutationId),
      edit: (id, patch) => owner.api.updateEntry(id, patch),
      delete: (id) => owner.api.deleteEntry(id),
    });
    if (!owner.current()) return;
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
    if (!owner.current()) return;
    toast.show(error, undefined, 'destructive');
  } finally {
    if (owner.current()) {
      draining = false;
      mutationRevision++;
    }
  }
}

const onlineHandler = () => void drainQueue();
let initialization: { lifetime: number; completion: Promise<void> } | null = null;
let legacyWork = $state(hasLegacyWork());
async function recoverLegacyWork(): Promise<void> {
  const scope = activeScope();
  if (scope === null) return;
  try {
    associateLegacyWork(scope);
    legacyWork = hasLegacyWork();
    initialization = null;
    await init();
  } catch (error) { toast.show(error, undefined, 'destructive'); }
}
function init(): Promise<void> {
  if (initialization?.lifetime === lifetime) return initialization.completion;
  const completion = initialize();
  initialization = { lifetime, completion };
  return completion;
}

async function initialize(): Promise<void> {
  const owner = session();
  const finish = () => {
    if (owner.current()) { syncing = false; masterLoading = false; }
  };
  if (!initialized) {
    initialized = true;
    window.addEventListener('online', onlineHandler);
  }
  try {
    const cache = loadSnapshot(owner.scope);
    if (cache) {
      entries = cache.entries.filter(entry => entry.id >= 0);
      master = cache.master; categories = cache.categories;
      if (cache.config) config = cache.config;
      if (cache.stats) stats = cache.stats;
    }
    injectQueue();
    syncLocalIds();
    syncing = !!cache;
    masterLoading = !!cache;
    const refreshing = refreshAll(!!cache);
    if (cache) {
      void refreshing.finally(finish);
      return;
    }
    await refreshing;
    finish();
  } catch (error) {
    if (owner.current()) toast.show(error, undefined, 'destructive');
    finish();
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
  get legacyWork() { return legacyWork; },
  recoverLegacyWork,
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
