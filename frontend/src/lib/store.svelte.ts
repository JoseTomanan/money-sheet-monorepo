import { createMutationId } from './mutationId';
import { connection, mockMode, onConnectionChange } from './connection.svelte';
import { captureGateway, isAuthError, isQueueable } from './api';
import { loadSnapshot, saveSnapshot } from './cacheSync';
import { toast } from './toast.svelte';
import { buildEntry, getMainCategory } from './domain';
import { queueFor, QueuePersistenceError, hasLegacyWork, associateLegacyWork } from './queue';
import type { QueueItem, DrainItemResult } from './queue';
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

let online = $state(navigator.onLine);
let disposed = $state(false);
let readFailed = $state(false);
let readFailure = $state('');
let statsPending = $state(false);
let configPending = $state(false);
function resetSyncStatus() {
  readFailed = false; readFailure = ''; statsPending = false; configPending = false;
}

let entries = $state<Entry[]>([]);
let master = $state<MasterRow>({ onHand: 0, budgets: {} });
let categories = $state<CategoryMap>({});
let config = $state<Config>({ currency: "₱" });
let stats = $state<StatsData>({ categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] });
let loading = $state(false);
let error = $state<string | null>(null);
let errorIsConnection = $state(false);
let masterLoading = $state(false);
let activeOperations = $state(0);
let hasSnapshot = $state(false);
let hasStats = $state(false);
let statsStale = $state(true);
let financialDirty = $state(false);
let lastUpdated = $state<number | null>(null);
let activeRefresh: { lifetime: number; completion: Promise<void> } | null = null;
let refreshDirty = false;
interface Operation { ids: Set<number>; deletion: boolean; phase: 'delivery' | 'waiting' | 'reconciliation'; failed: boolean; failure?: string; revision: number; }
let operations = $state(new Map<symbol, Operation>());
const waiting = $derived(readFailed || [...operations.values()].some(operation => operation.failed));
function publishOperations() {
  operations = new Map(operations);
  activeOperations = operations.size;
}
let baseline: Entry[] = [];
let acknowledgmentsPending = $state(false);
const acknowledgedEntries = new Map<number, Entry>();
const acknowledgedDeletes = new Set<number>();
let pendingIds = $state(new Set<number>());
let deletePendingIds = $state(new Set<number>());
let localIds = $state<Set<number>>(new Set());
let queueCount = $state(0);
let draining = $state(false);
let activeDrain: { lifetime: number; completion: Promise<void>; retry: boolean } | null = null;
let syncing = $state(false);
let nextTemporaryId = -1;
// Discard snapshots begun before an operation changed or settled. Pending
// rows are overlaid on snapshots begun during the operation below.
let mutationRevision = 0;
let refreshSequence = 0;
const confirmedIds = new Set<number>();

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
  resetSyncStatus();
  lifetime++;
  refreshSequence++;
  mutationRevision++;
  baseline = []; acknowledgedEntries.clear(); acknowledgedDeletes.clear(); acknowledgmentsPending = false;
  entries = []; master = { onHand: 0, budgets: {} }; categories = {};
  config = { currency: '\u20b1' };
  stats = { categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] };
  pendingIds = new Set(); deletePendingIds = new Set(); localIds = new Set(); queueCount = 0;
  confirmedIds.clear(); operations = new Map(); activeOperations = 0;
  hasSnapshot = false; hasStats = false; statsStale = true; financialDirty = false; lastUpdated = null; activeRefresh = null; activeDrain = null; refreshDirty = false;
  loading = false; error = null; errorIsConnection = false;
  masterLoading = false; draining = false; syncing = false; nextTemporaryId = -1;
  toast.dismiss();
  void init();
}
let stopConnection: (() => void) | null = onConnectionChange(activate);

const QUEUED_ADD_FROZEN_MESSAGE = "This entry is waiting to sync — sync it first, then try again.";

function notifyQueuedError(error: unknown): void {
  if (isAuthError(error) || error instanceof QueuePersistenceError) toast.show(error, undefined, 'destructive');
}

function queueReadable(): boolean {
  try { readQueue(); return true; }
  catch (error) { toast.show(error, undefined, 'destructive'); return false; }
}

function mutationInFlight(id: number): boolean {
  return ((pendingIds.has(id) || deletePendingIds.has(id)) && !confirmedIds.has(id)) || (draining && localIds.has(id));
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
  readFailed = true;
  readFailure = failures.map(({ label, rejection }) => `${label}: ${rejectionMessage(rejection)}`).join('; ');

  if (failures.every(({ rejection }) => isQueueable(rejection.reason) && !isAuthError(rejection.reason))) {
    return;
  }
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

// Operations retain presentation overlays through reconciliation; confirmation
// releases interaction guards before reads finish. Valid snapshots supply sheet rows.
// Closures belong to a Connection lifetime, so old completions cannot release
// pending state or balance work in a newly activated Connection.
// Acknowledgments are confirmed cache metadata, not unsent work. Preserve them
// across reload while the coherent core snapshot still contains older values.
function acknowledge(saved: Entry[], deletedIds: number[], scope = activeScope()): void {
  for (const entry of saved) { acknowledgedEntries.set(entry.id, entry); acknowledgedDeletes.delete(entry.id); }
  for (const id of deletedIds) { acknowledgedEntries.delete(id); acknowledgedDeletes.add(id); }
  acknowledgmentsPending = acknowledgedEntries.size > 0 || acknowledgedDeletes.size > 0;
  const changed = new Set([...saved.map(entry => entry.id), ...deletedIds]);
  baseline = [...baseline.filter(entry => !changed.has(entry.id)), ...saved].sort(compareEntriesForDisplay);
  const cache = loadSnapshot(scope);
  if (cache) saveSnapshot({ ...cache, acknowledged: { entries: [...acknowledgedEntries.values()], deletedIds: [...acknowledgedDeletes] }, statsStale: true }, scope);
}

function beginOperation(ids: number[] = [], deletion = false) {
  const generation = lifetime;
  const key = Symbol('operation');
  const tracked = new Set(ids);
  const mark = deletion ? addDeletePending : addPending;
  const unmark = deletion ? removeDeletePending : removePending;
  for (const id of tracked) {
    for (const [key, earlier] of operations) {
      earlier.ids.delete(id);
      if (!earlier.ids.size) operations.delete(key);
    }
    confirmedIds.delete(id);
    mark(id);
  }
  mutationRevision++;
  statsStale = true; financialDirty = true;
  const record: Operation = { ids: tracked, deletion, phase: 'delivery', failed: false, revision: mutationRevision };
  operations.set(key, record);
  publishOperations();

  return {
    confirm(replacements?: Entry[]) {
      if (generation !== lifetime) return;
      if (replacements) {
        const temporaryIds = [...tracked];
        replacements.forEach((entry, index) => { replaceEntry(temporaryIds[index], entry); unmark(temporaryIds[index]); });
        tracked.clear();
        for (const entry of replacements) { tracked.add(entry.id); mark(entry.id); }
      }
      for (const id of tracked) confirmedIds.add(id);
      const queued = getLocalEntryIds();
      const acknowledged = [...tracked].filter(id => !queued.has(id));
      acknowledge(deletion ? [] : entries.filter(entry => acknowledged.includes(entry.id)), deletion ? acknowledged : []);
      record.phase = 'reconciliation';
      record.failed = false;
      record.revision = ++mutationRevision;
      publishOperations();

    },
    wait(error?: unknown) {
      if (generation !== lifetime) return;
      record.phase = 'waiting'; record.failed ||= !!error;
      if (error) record.failure = error instanceof Error ? error.message : String(error);
      publishOperations();
    },
    rollback(previous: Entry) {
      if (generation !== lifetime) return;
      entries = [...entries.filter(entry => entry.id !== previous.id), previous].sort(compareEntriesForDisplay);
      unmark(previous.id); tracked.delete(previous.id);
      mutationRevision++;
    },
    finish() {
      if (generation !== lifetime) return;
      if (record.phase !== 'reconciliation') for (const id of tracked) unmark(id);
      if (record.phase === 'delivery') operations.delete(key);
      publishOperations();
      if (activeOperations === 0 && localIds.size === 0 && !acknowledgmentsPending && !statsPending && !readFailed) financialDirty = false;

    },
  };
}

function beginSnapshot(silent: boolean) {
  const owner = session();
  const revision = mutationRevision;
  const sequence = ++refreshSequence;
  if (!silent) { loading = !hasSnapshot; error = null; errorIsConnection = false; }
  return {
    owner,
    current: () => owner.current() && sequence === refreshSequence,
    changed: () => revision !== mutationRevision,
    revision,
    finish() {
      // The newest read inherits foreground loading, including silent retries
      // and mutation reconciliation that supersede a visible refresh.
      if (owner.current() && sequence === refreshSequence) loading = false;
    },
  };
}

function acceptSnapshot(snapshot: { entries: Entry[]; master: MasterRow; categories: CategoryMap }, scope: string | null, revision: number): void {
  const queue = readQueue();
  // The cache is the confirmed server baseline, never the presentation overlay.
  baseline = snapshot.entries; acknowledgedEntries.clear(); acknowledgedDeletes.clear(); acknowledgmentsPending = false;
  hasSnapshot = true;
  lastUpdated = Date.now();
  saveSnapshot({ ...snapshot, config, stats: hasStats ? stats : undefined, lastUpdated, statsStale, statsAvailable: hasStats }, scope);
  for (const [key, operation] of operations) {
    if (operation.phase === 'reconciliation' && operation.revision <= revision) {
      for (const id of operation.ids) { confirmedIds.delete(id); removePending(id); removeDeletePending(id); }
      operations.delete(key);
    }
  }
  publishOperations();
  if (!statsStale && activeOperations === 0 && queue.length === 0) financialDirty = false;
  const overlayIds = new Set([...operations.values()].filter(op => !op.deletion).flatMap(op => [...op.ids]));
  const hiddenIds = new Set([...operations.values()].filter(op => op.deletion).flatMap(op => [...op.ids]));
  const overlays = entries.filter(entry => overlayIds.has(entry.id));
  entries = snapshot.entries; master = snapshot.master; categories = snapshot.categories;
  injectQueue(queue);
  const byId = new Map(overlays.map(entry => [entry.id, entry]));
  entries = entries.map(entry => byId.get(entry.id) ?? entry);
  entries = [...entries, ...overlays.filter(entry => !entries.some(current => current.id === entry.id))]
    .filter(entry => !hiddenIds.has(entry.id));
  syncLocalIds();
}

function reconcile(): Promise<void> {
  if (activeRefresh?.lifetime === lifetime) { refreshDirty = true; return Promise.resolve(); }
  return refreshAll(true);
}

function refreshAll(silent = false): Promise<void> {
  disposed = false;
  if (activeRefresh?.lifetime === lifetime) return activeRefresh.completion;
  const generation = lifetime;
  const completion = (async () => {
    do {
      refreshDirty = false;
      await refreshCycle(silent);
    } while (generation === lifetime && refreshDirty);
  })().finally(() => { if (generation === lifetime) { activeRefresh = null; syncing = false; } });
  activeRefresh = { lifetime: generation, completion };
  syncing = true;
  readFailed = false; readFailure = '';
  return completion;
}

async function refreshCycle(silent: boolean): Promise<void> {
  const snapshot = beginSnapshot(silent);
  const { owner } = snapshot;
  const cycleFailures: RefreshFailure[] = [];
  const report = (failures: RefreshFailure[]) => { cycleFailures.push(...failures); notifyRefreshFailures(cycleFailures); };
  const optionalCurrent = () => snapshot.current() && !snapshot.changed();
  const releaseObsoleteStats = () => {
    if (!snapshot.current()) return;
    statsPending = false;
    if (activeOperations === 0 && localIds.size === 0 && !acknowledgmentsPending) financialDirty = false;

  };
  // Optional reads have their own publication lifetime and never gate the core.
  configPending = true;
  void owner.api.getConfig().then(value => {
    if (snapshot.current()) configPending = false;
    if (optionalCurrent()) config = value;
  }, cause => {
    if (snapshot.current()) configPending = false;
    if (optionalCurrent()) report([{ label: 'settings', rejection: { status: 'rejected', reason: cause } }]);
  });
  statsStale = true; statsPending = true;
  void owner.api.getStats().then(value => {
    if (!optionalCurrent()) { releaseObsoleteStats(); return; }
    stats = value; hasStats = true; statsStale = false; statsPending = false;
    if (activeOperations === 0 && localIds.size === 0 && !acknowledgmentsPending) financialDirty = false;

    const cache = loadSnapshot(owner.scope);
    if (cache) saveSnapshot({ ...cache, config, stats, statsStale: false, statsAvailable: true }, owner.scope);
  }, cause => {
    if (!optionalCurrent()) { releaseObsoleteStats(); return; }
    if (optionalCurrent()) { statsPending = false; report([{ label: 'statistics', rejection: { status: 'rejected', reason: cause } }]); }
  });
  try {
    const [e, m, c] = await Promise.allSettled([owner.api.getEntries(), owner.api.getMaster(), owner.api.getCategories()]);
    if (!snapshot.current()) return;
    const failures: RefreshFailure[] = [];
    if (isRejected(e)) failures.push({ label: 'entries', rejection: e });
    if (isRejected(m)) failures.push({ label: 'balances', rejection: m });
    if (isRejected(c)) failures.push({ label: 'categories', rejection: c });
    if (failures.length) { handleCoreRefreshFailures([...failures, ...cycleFailures], silent || hasSnapshot); return; }
    if (e.status !== 'fulfilled' || m.status !== 'fulfilled' || c.status !== 'fulfilled') return;
    if (snapshot.changed()) { refreshDirty = true; return; }
    acceptSnapshot({ entries: e.value, master: m.value, categories: c.value }, owner.scope, snapshot.revision);
    error = null; errorIsConnection = false; readFailed = cycleFailures.length > 0;
  } catch (cause) {
    if (!snapshot.current()) return;
    readFailed = true;
    readFailure = cause instanceof Error ? cause.message : String(cause);

    toast.show(cause, undefined, 'destructive');
    if (!hasSnapshot) { error = cause instanceof Error ? cause.message : String(cause); errorIsConnection = isQueueable(cause); }
  } finally { snapshot.finish(); }
}

function replaceEntry(id: number, next: Entry): void {
  entries = entries.map((entry) => entry.id === id ? next : entry);
}

function syncLocalIds(): void {
  try { queueCount = readQueue().length; localIds = getLocalEntryIds(); }
  catch (error) { toast.show(error, undefined, 'destructive'); }
}

function reserveRehydratedTemporaryIds(): void {
  const restoredIds = entries.filter((entry) => entry.id < 0).map((entry) => entry.id);
  if (restoredIds.length > 0) {
    nextTemporaryId = Math.min(nextTemporaryId, Math.min(...restoredIds) - 1);
  }
}

function submitAddEntry(payload: AddEntryPayload | AddEntryPayload[]): EntrySubmission {
  const owner = session();
  const legs = Array.isArray(payload) ? payload : [payload];
  const tempIds = legs.map(() => nextTemporaryId--);
  const item: QueueItem = Array.isArray(payload)
    ? { op: 'addBatch', tempIds, payloads: legs, mutationId: createMutationId() }
    : { op: 'add', tempId: tempIds[0], payload, mutationId: createMutationId() };
  const admission = owner.queue.admit<Entry | Entry[]>(item, saved => saved.op === 'add'
    ? owner.api.addEntry(saved.payload, saved.mutationId)
    : owner.api.addEntries((saved as Extract<QueueItem, { op: 'addBatch' }>).payloads, (saved as Extract<QueueItem, { op: 'addBatch' }>).mutationId));
  if (!admission.accepted) return refused(admission.error);
  entries = [...entries, ...legs.map((leg, index) => buildEntry(tempIds[index], leg, categories))];
  const operation = beginOperation(tempIds);
  syncLocalIds();
  const completion = (async () => {
    try {
      const outcome = await admission.completion;
      if (!owner.current()) return false;
      syncLocalIds();
      if (outcome.status === 'confirmed') {
        operation.confirm(Array.isArray(outcome.value) ? outcome.value : [outcome.value]);
        await reconcile();
        void drainQueue(true);
      } else if (outcome.status === 'queued') {
        operation.wait(outcome.error);
        notifyQueuedError(outcome.error);
        if (!outcome.error) void drainQueue(true);
      } else {
        entries = entries.filter(entry => !tempIds.includes(entry.id));
        toast.show(outcome.error, undefined, 'destructive');
        return false;
      }
      return true;
    } finally { if (owner.current()) syncLocalIds(); operation.finish(); }
  })();
  return { accepted: true, completion };
}
function addEntry(payload: AddEntryPayload | AddEntryPayload[]): Promise<boolean> {
  return submitAddEntry(payload).completion;
}

function refused(message?: unknown): EntrySubmission {
  if (message) toast.show(message, undefined, 'destructive');
  return { accepted: false, error: message ? (message instanceof Error ? message.message : String(message)) : 'This entry is waiting to sync. Try again after it finishes.', completion: Promise.resolve(false) };
}
function submitExisting(ids: number[], patch?: UpdateEntryPatch, bulk = false): EntrySubmission {
  const owner = session();
  if (!queueReadable()) return refused();
  const unique = [...new Set(ids)];
  if (unique.length === 0 || unique.some(id => !entries.some(entry => entry.id === id) || mutationInFlight(id))) return refused();
  if (unique.some(isQueuedAddId)) return refused(QUEUED_ADD_FROZEN_MESSAGE);
  const previous = new Map(entries.filter(entry => unique.includes(entry.id)).map(entry => [entry.id, entry]));
  const items: QueueItem[] = unique.map(id => patch ? { op: 'edit', id, patch } : { op: 'delete', id });
  const deliver = (saved: QueueItem) => saved.op === 'edit' ? owner.api.updateEntry(saved.id, saved.patch) : owner.api.deleteEntry((saved as Extract<QueueItem, { op: 'delete' }>).id);
  const admission = bulk ? owner.queue.admitMany(items, deliver) : (() => {
    const result = owner.queue.admit(items[0], deliver);
    return { accepted: result.accepted, error: result.error, completions: [result.completion] };
  })();
  if (!admission.accepted) return refused(admission.error);
  if (patch) {
    const entry = previous.get(unique[0])!;
    replaceEntry(entry.id, { ...entry, ...patch, mainCategory: patch.tag ? getMainCategory(patch.tag, categories) : entry.mainCategory });
  } else entries = entries.filter(entry => !previous.has(entry.id));
  const operation = beginOperation(unique, !patch);
  syncLocalIds();
  const completion = (async () => {
    let failed = 0;
    let confirmed = false;
    try {
      await Promise.all(admission.completions.map(async (completion, index) => {
        const outcome = await completion;
        if (!owner.current()) return;
        if (outcome.status === 'failed') {
          operation.rollback(previous.get(unique[index])!);
          failed++;
          if (!bulk) toast.show(outcome.error, undefined, 'destructive');
        } else if (outcome.status === 'confirmed') confirmed = true;
        else { operation.wait(outcome.error); notifyQueuedError(outcome.error); if (!outcome.error) void drainQueue(true); }
      }));
      if (!owner.current()) return false;
      syncLocalIds();
      if (failed && bulk) toast.show(`Failed to delete ${failed} entr${failed === 1 ? 'y' : 'ies'}.`, undefined, 'destructive');
      if (confirmed) { operation.confirm(); await reconcile(); void drainQueue(true); }
      return failed === 0;
    } finally { if (owner.current()) syncLocalIds(); operation.finish(); }
  })();
  return { accepted: true, completion };
}
function submitUpdateEntry(id: number, patch: UpdateEntryPatch): EntrySubmission { return submitExisting([id], patch); }
function updateEntry(id: number, patch: UpdateEntryPatch): Promise<boolean> { return submitUpdateEntry(id, patch).completion; }
function submitDeleteEntry(id: number): EntrySubmission { return submitExisting([id]); }
function deleteEntry(id: number): Promise<boolean> { return submitDeleteEntry(id).completion; }
function submitDeleteEntries(ids: number[]): EntrySubmission { return submitExisting(ids, undefined, true); }
async function deleteEntries(ids: number[]): Promise<void> { await submitDeleteEntries(ids).completion; }

function drainQueue(automatic = false): Promise<void> {
  if (activeDrain?.lifetime === lifetime) {
    if (!automatic) activeDrain.retry = true;
    return activeDrain.completion;
  }
  const generation = lifetime;
  const run = { lifetime: generation, retry: false, completion: Promise.resolve() };
  run.completion = (async () => {
    do {
      run.retry = false;
      await drainCycle(automatic);
      if (run.retry) automatic = false;
    } while (generation === lifetime && run.retry);
  })().finally(() => { if (generation === lifetime) activeDrain = null; });
  activeDrain = run;
  return run.completion;
}

function applyReplayResult(result: DrainItemResult): void {
  if (result.status === 'drained') {
    const stillQueued = getLocalEntryIds();
    const item = result.item;
    const ids = item.op === 'add' ? [item.tempId] : item.op === 'addBatch' ? item.tempIds : [item.id];
    const replacements = item.op === 'add' ? [result.entry!] : item.op === 'addBatch' ? result.entries! : [];
    for (const record of operations.values()) {
      if (!ids.some(id => record.ids.has(id)) || ids.some(id => stillQueued.has(id))) continue;
      for (const id of ids) { record.ids.delete(id); removePending(id); removeDeletePending(id); confirmedIds.delete(id); }
      for (const entry of replacements) { record.ids.add(entry.id); confirmedIds.add(entry.id); }
      if (replacements.length === 0) for (const id of ids) { record.ids.add(id); confirmedIds.add(id); }
      record.phase = 'reconciliation'; record.failed = false; record.revision = ++mutationRevision;
    }
    if (item.op === 'add') {
      acknowledge([result.entry!], []);
      replaceEntry(item.tempId, result.entry!);
    } else if (item.op === 'addBatch') {
      acknowledge(result.entries!, []);
      for (let index = 0; index < item.tempIds.length; index++) {
        replaceEntry(item.tempIds[index], result.entries![index]);
      }
    } else if (item.op === 'delete') {
      acknowledge([], [item.id]);
      entries = entries.filter((entry) => entry.id !== item.id);
    } else if (item.op === 'edit') {
      const previous = baseline.find(entry => entry.id === item.id);
      if (previous) acknowledge([{ ...previous, ...item.patch, mainCategory: item.patch.tag ? getMainCategory(item.patch.tag, categories) : previous.mainCategory }], []);
    }
  } else if (result.status === 'rejected') {
    const item = result.item;
    const ids = item.op === 'add' ? [item.tempId] : item.op === 'addBatch' ? item.tempIds : [item.id];
    for (const [key, record] of operations) {
      for (const id of ids) record.ids.delete(id);
      if (!record.ids.size) operations.delete(key);
    }
    entries = entries.filter(entry => !ids.includes(entry.id));
    entries = [...entries, ...baseline.filter(entry => ids.includes(entry.id))].sort(compareEntriesForDisplay);
    for (const id of ids) { removePending(id); removeDeletePending(id); confirmedIds.delete(id); }
    injectQueue();
    mutationRevision++;
    toast.show(result.error, undefined, 'destructive');
  } else if (isAuthError(result.error) || !isQueueable(result.error)) {
    toast.show(result.error, undefined, 'destructive');
  }
  syncLocalIds();
  publishOperations();

}

async function drainCycle(automatic: boolean): Promise<void> {
  const owner = session();
  if (draining || !queueReadable() || getLocalEntryIds().size === 0) return;
  for (const [key, record] of operations) if (!record.ids.size && record.phase === 'waiting') operations.delete(key);
  draining = true;
  const operation = beginOperation();
  try {
    if (getLocalEntryIds().size === 0) return;
    const results = await owner.queue.requestDrain({
      isCurrent: owner.current,
      automatic,
      onResult: result => { if (owner.current()) applyReplayResult(result); },
      add: (payload, mutationId) => owner.api.addEntry(payload, mutationId),
      addEntries: (payloads, mutationId) => owner.api.addEntries(payloads, mutationId),
      edit: (id, patch) => owner.api.updateEntry(id, patch),
      delete: (id) => owner.api.deleteEntry(id),
    });
    if (!owner.current()) return;
    syncLocalIds();
    const stopped = results.find(result => result.status === 'stopped');
    if (results.some(result => result.status === 'drained')) operation.confirm();
    // A later failure still owns the status after earlier items were confirmed.
    if (stopped?.status === 'stopped') operation.wait(stopped.error);
    if (results.some(result => result.status === 'drained')) await reconcile();
  } catch (error) {
    if (!owner.current()) return;
    toast.show(error, undefined, 'destructive');
  } finally {
    if (owner.current()) {
      draining = false;
    }
    operation.finish();
  }
}

const offlineHandler = () => { online = false; };
const onlineHandler = () => { online = true; if (localIds.size > 0) void drainQueue(); else if (readFailed) void refreshAll(true); };
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
  disposed = false;
  stopConnection ??= onConnectionChange(activate);
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
    online = navigator.onLine;
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
  }
  try {
    const cache = loadSnapshot(owner.scope);
    if (cache) {
      baseline = cache.entries.filter(entry => entry.id >= 0);
      const ack = cache.acknowledged;
      if (ack) {
        acknowledgmentsPending = ack.entries.length > 0 || ack.deletedIds.length > 0;
        const changed = new Set([...ack.entries.map(entry => entry.id), ...ack.deletedIds]);
        baseline = [...baseline.filter(entry => !changed.has(entry.id)), ...ack.entries].sort(compareEntriesForDisplay);
        for (const entry of ack.entries) acknowledgedEntries.set(entry.id, entry);
        for (const id of ack.deletedIds) acknowledgedDeletes.add(id);
        for (const [ids, deletion] of [[ack.entries.map(entry => entry.id), false], [ack.deletedIds, true]] as const) {
          if (ids.length === 0) continue;
          operations.set(Symbol('restored acknowledgment'), { ids: new Set(ids), deletion, phase: 'reconciliation', failed: false, revision: ++mutationRevision });
          for (const id of ids) confirmedIds.add(id);
        }
        publishOperations();
      }
      entries = baseline;
      master = cache.master; categories = cache.categories;
      hasSnapshot = true; lastUpdated = cache.lastUpdated ?? null; hasStats = cache.statsAvailable ?? !!cache.stats; statsStale = cache.statsStale ?? false;
      if (cache.config) config = cache.config;
      if (cache.stats) stats = cache.stats;
    }
    injectQueue();
    syncLocalIds();
    financialDirty = localIds.size > 0 || activeOperations > 0;
    syncing = !!cache;
    masterLoading = !!cache;

    const refreshing = refreshAll(!!cache);
    if (localIds.size > 0 && navigator.onLine) void drainQueue();
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

function syncStatus(): { phase: 'ready' | 'busy' | 'waiting' | 'inactive'; detail: string; action: string } {
  if (disposed) return { phase: 'inactive', detail: 'Sync is stopped.', action: '' };
  const busy = syncing || draining || statsPending || configPending || activeOperations > 0 || acknowledgmentsPending || queueCount > 0;
  const failure = readFailed ? readFailure : [...operations.values()].find(op => op.failed)?.failure;
  if (mockMode.current) return {
    phase: waiting ? 'waiting' : busy ? 'busy' : 'inactive',
    detail: waiting ? `Demo Mode. Unable to update demo data. ${failure || 'Retry pending work.'} ${queueCount ? `${queueCount} pending demo change${queueCount === 1 ? '' : 's'} for this session.` : ''}`.trim() :
      busy ? 'Demo Mode. Updating demo data; changes last for this session.' : 'Demo Mode. No spreadsheet is connected; changes last for this session.',
    action: queueCount > 0 ? 'Sync now' : 'Refresh demo',
  };
  if (!connection.current) return { phase: 'inactive', detail: 'No Connection. Open Settings to connect your spreadsheet.', action: '' };
  const action = queueCount > 0 ? 'Sync now' : 'Refresh data';
  const pending = queueCount > 0
    ? `${queueCount} pending change${queueCount === 1 ? '' : 's'} saved on this device; not yet confirmed in Sheets.`
    : acknowledgmentsPending ? 'Confirmed in Sheets; updating balances and statistics.' : '';
  if (!online) return { phase: 'waiting', detail: `Offline. ${pending || 'Showing the last confirmed data.'}`, action };
  if (waiting) {
    return { phase: 'waiting', detail: `Unable to sync. ${failure || 'Retry to resume pending work.'} ${pending}`.trim(), action };
  }
  if (busy) {
    return { phase: 'busy', detail: pending || 'Refreshing data from Sheets.', action };
  }
  if (!hasSnapshot) return { phase: 'waiting', detail: 'Data unavailable. Refresh to load confirmed data from Sheets.', action };
  return { phase: 'ready', detail: 'Up to date. Confirmed data from Sheets.', action };
}

export const store = {
  get syncStatus() { return syncStatus(); },
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
  get masterLoading() { return masterLoading || activeOperations > 0; },
  get hasSnapshot() { return hasSnapshot; },
  get hasStats() { return hasStats; },
  get statsStale() { return statsStale; },
  get statisticsAwaitingSync() { return financialDirty && statsStale; },
  get lastUpdated() { return lastUpdated; },
  get balancesStale() { return acknowledgmentsPending || activeOperations > 0 || localIds.size > 0; },
  get pendingIds() { return pendingIds; },
  get busyIds() { operations; return new Set([...pendingIds, ...deletePendingIds].filter(id => !confirmedIds.has(id)).concat(draining ? [...localIds] : [])); },
  get deletePendingIds() { return deletePendingIds; },
  get localIds() { return localIds; },
  get draining() { return draining; },
  get syncing() { return syncing; },
  get syncWaiting() { return waiting; },

  init,
  refreshAll,
  retrySync() { return queueCount > 0 ? drainQueue() : refreshAll(true); },
  addEntry,
  submitAddEntry,
  dispose() {
    disposed = true;
    resetSyncStatus(); lifetime++; refreshSequence++;
    stopConnection?.(); stopConnection = null;
    window.removeEventListener('online', onlineHandler);
    window.removeEventListener('offline', offlineHandler);
    initialized = false; initialization = null; activeRefresh = null; activeDrain = null;
    operations = new Map(); confirmedIds.clear(); activeOperations = 0;
    pendingIds = new Set(); deletePendingIds = new Set(); draining = false; syncing = false;
  },
  updateEntry,
  submitUpdateEntry,
  deleteEntry,
  submitDeleteEntry,
  submitDeleteEntries,
  deleteEntries,
  drainQueue,
};
