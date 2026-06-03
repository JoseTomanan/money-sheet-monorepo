import * as api from './api';
import { ConnectionError } from './api';
import { readCache, writeCache } from './cache';
import { readQueue, writeQueue, enqueue } from './queue';
import type { QueueItem } from './queue';
import { getMainCategory, buildEntry } from './domain';
import { dedupeEntries } from './dedupe';
import type {
  Entry,
  MasterRow,
  CategoryMap,
  AddEntryPayload,
  UpdateEntryPatch,
} from './types';

let entries = $state<Entry[]>([]);
let master = $state<MasterRow>({ onHand: 0, budgets: {} });
let categories = $state<CategoryMap>({});
let loading = $state(false);
let error = $state<string | null>(null);
let errorIsConnection = $state(false);
let masterLoading = $state(false);
let toastMsg = $state<string | null>(null);
let toastAction = $state<{ label: string; run: () => void } | null>(null);
let toastIsConnection = $state(false);
let pendingIds = $state(new Set<number>());
let deletePendingIds = $state(new Set<number>());
let queue = $state<QueueItem[]>(readQueue());
const localIds = $derived(
  new Set<number>(queue.flatMap((item) => (item.op === 'add' ? [item.tempId] : [item.id])))
);
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

function showToast(msgOrErr: unknown, action?: { label: string; run: () => void }): void {
  toastMsg = msgOrErr instanceof Error ? msgOrErr.message : String(msgOrErr);
  toastAction = action ?? null;
  toastIsConnection = msgOrErr instanceof ConnectionError;
  if (!action) {
    setTimeout(() => { toastMsg = null; toastIsConnection = false; }, 3000);
  }
}

function syncQueue(): void {
  queue = readQueue();
}

function injectQueueEntries(): void {
  for (const item of queue) {
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

async function submitLegs(legs: AddEntryPayload[]): Promise<void> {
  const now = Date.now();
  const tempIds = legs.map((_, i) => -(now + i));
  entries = [...entries, ...legs.map((leg, i) => buildEntry(tempIds[i], leg, categories))];
  for (const id of tempIds) addPending(id);
  masterLoading = true;
  try {
    const results = await Promise.allSettled(legs.map((p) => withTimeout(api.addEntry(p))));

    for (let i = 0; i < results.length; i++) {
      const tempId = tempIds[i];
      removePending(tempId);
      if (results[i].status === 'fulfilled') {
        const real = (results[i] as PromiseFulfilledResult<Entry>).value;
        entries = entries.map((e) => (e.id === tempId ? real : e));
      } else {
        // Failed leg stays as a Local Entry in the queue
        enqueue({ op: 'add', tempId, payload: legs[i] });
      }
    }
    syncQueue();

    const ok = results.filter((r) => r.status === 'fulfilled').length;
    if (ok === results.length) {
      toastMsg = null;
      toastAction = null;
      await refreshAll(true);
    } else {
      await refreshAll(true);
    }
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
    const [e, m, c] = await withTimeout(Promise.all([
      api.getEntries(),
      api.getMaster(),
      api.getCategories(),
    ]));
    entries = e;
    master = m;
    categories = c;
    injectQueueEntries();
    writeCache({ entries, master, categories });
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
  queue = readQueue(); // re-sync in case localStorage changed since module load
  const cache = readCache();
  if (cache) {
    entries = dedupeEntries(cache.entries);
    master = cache.master;
    categories = cache.categories;
    injectQueueEntries();
    syncing = true;
    masterLoading = true;
    void refreshAll(true).finally(() => {
      syncing = false;
      masterLoading = false;
    });
  } else {
    await refreshAll(false);
    injectQueueEntries();
  }
  window.addEventListener('online', () => void drainQueue());
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
  } catch {
    enqueue({ op: 'add', tempId, payload });
    syncQueue();
    removePending(tempId);
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

  // Local Entry: coalesce into queue directly, no API call
  if (localIds.has(id)) {
    enqueue({ op: 'edit', id, patch });
    syncQueue();
    return;
  }

  addPending(id);
  masterLoading = true;
  try {
    await withTimeout(api.updateEntry(id, patch));
    await refreshAll(true);
  } catch (err) {
    if (err instanceof ConnectionError) {
      enqueue({ op: 'edit', id, patch });
      syncQueue();
      // Entry stays with its optimistic state
    } else {
      entries = entries.map((e) => (e.id === id ? prev : e));
      showToast(err);
    }
  } finally {
    removePending(id);
    masterLoading = false;
  }
}

async function deleteEntry(id: number): Promise<void> {
  if (!entries.some((e) => e.id === id)) return;

  // Local Entry: coalesce into queue directly, no API call
  if (localIds.has(id)) {
    enqueue({ op: 'delete', id });
    syncQueue();
    entries = entries.filter((e) => e.id !== id);
    return;
  }

  addDeletePending(id);
  masterLoading = true;
  try {
    await withTimeout(api.deleteEntry(id));
    entries = entries.filter((e) => e.id !== id);
    await refreshAll(true);
  } catch (err) {
    if (err instanceof ConnectionError) {
      enqueue({ op: 'delete', id });
      syncQueue();
      // Entry stays visible as a Local Entry
    } else {
      showToast(err);
    }
  } finally {
    removeDeletePending(id);
    masterLoading = false;
  }
}

async function drainQueue(): Promise<void> {
  if (draining || queue.length === 0) return;
  draining = true;
  try {
    while (queue.length > 0) {
      const item = queue[0];
      try {
        if (item.op === 'add') {
          const real = await withTimeout(api.addEntry(item.payload));
          entries = entries.map((e) => (e.id === item.tempId ? real : e));
        } else if (item.op === 'edit') {
          await withTimeout(api.updateEntry(item.id, item.patch));
        } else if (item.op === 'delete') {
          await withTimeout(api.deleteEntry(item.id));
          entries = entries.filter((e) => e.id !== item.id);
        }
        queue = queue.slice(1);
        writeQueue(queue);
      } catch {
        break;
      }
    }
    if (queue.length === 0) {
      await refreshAll(true);
    }
  } finally {
    draining = false;
  }
}

export const store = {
  get entries() { return entries; },
  get master() { return master; },
  get categories() { return categories; },
  get loading() { return loading; },
  get error() { return error; },
  get errorIsConnection() { return errorIsConnection; },
  get masterLoading() { return masterLoading; },
  get toastMsg() { return toastMsg; },
  get toastAction() { return toastAction; },
  get toastIsConnection() { return toastIsConnection; },
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
  drainQueue,
  dismissToast: () => { toastMsg = null; toastAction = null; toastIsConnection = false; },
};
