import * as api from './api';
import { ConnectionError, UnauthorizedError } from './api';
import { readCache, writeCache } from './cache';
import {
  getLocalEntryIds,
  getQueueItems,
  submitAdd,
  submitEdit,
  submitDelete,
  drain,
} from './offlineMutation';
import { getMainCategory, buildEntry } from './domain';
import { dedupeEntries } from './dedupe';
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
let toastMsg = $state<string | null>(null);
let toastAction = $state<{ label: string; run: () => void } | null>(null);
let toastIsConnection = $state(false);
let toastVariant = $state<'default' | 'destructive'>('default');
let pendingIds = $state(new Set<number>());
let deletePendingIds = $state(new Set<number>());
let localIds = $state<Set<number>>(getLocalEntryIds());
let draining = $state(false);
let syncing = $state(false);

const REQUEST_TIMEOUT_MS = 15_000;

// Svelte 5 requires full reassignment to trigger reactivity on Set state.
function addPending(id: number): void { pendingIds = new Set([...pendingIds, id]); }
function removePending(id: number): void { pendingIds = new Set([...pendingIds].filter((p) => p !== id)); }
function addDeletePending(id: number): void { deletePendingIds = new Set([...deletePendingIds, id]); }
function removeDeletePending(id: number): void { deletePendingIds = new Set([...deletePendingIds].filter((p) => p !== id)); }

function syncLocalIds(): void {
  localIds = getLocalEntryIds();
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new ConnectionError('Request timed out.')), REQUEST_TIMEOUT_MS)
    ),
  ]);
}

function showToast(
  msgOrErr: unknown,
  action?: { label: string; run: () => void },
  variant: 'default' | 'destructive' = 'default',
): void {
  toastMsg = msgOrErr instanceof Error ? msgOrErr.message : String(msgOrErr);
  toastAction = action ?? null;
  toastIsConnection = msgOrErr instanceof ConnectionError;
  toastVariant = variant;
  // Destructive (auth) toasts stay until dismissed — they require user action.
  if (!action && variant !== 'destructive') {
    setTimeout(() => { toastMsg = null; toastIsConnection = false; toastVariant = 'default'; }, 3000);
  }
}

function injectQueueEntries(): void {
  for (const item of getQueueItems()) {
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
    const outcomes = await Promise.all(
      legs.map((leg, i) => submitAdd(tempIds[i], leg, () => withTimeout(api.addEntry(leg))))
    );

    for (let i = 0; i < outcomes.length; i++) {
      const tempId = tempIds[i];
      removePending(tempId);
      const outcome = outcomes[i];
      if (outcome.status === 'confirmed') {
        entries = entries.map((e) => (e.id === tempId ? outcome.entry : e));
      }
      // queued legs stay as Local Entries
    }
    syncLocalIds();

    const authErr = outcomes
      .filter((o) => o.status === 'queued' && o.error instanceof UnauthorizedError)
      .map((o) => (o as { status: 'queued'; error: unknown }).error)[0];
    if (authErr) {
      showToast(authErr, undefined, 'destructive');
    } else if (outcomes.every((o) => o.status === 'confirmed')) {
      toastMsg = null;
      toastAction = null;
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
    const [e, m, c, cfg] = await withTimeout(Promise.all([
      api.getEntries(),
      api.getMaster(),
      api.getCategories(),
      api.getConfig(),
    ]));
    entries = e;
    master = m;
    categories = c;
    config = cfg;
    injectQueueEntries();
    syncLocalIds();
    writeCache({ entries, master, categories, config });
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
  syncLocalIds();
  const cache = readCache();
  if (cache) {
    entries = dedupeEntries(cache.entries);
    master = cache.master;
    categories = cache.categories;
    if (cache.config) config = cache.config;
    injectQueueEntries();
    syncLocalIds();
    syncing = true;
    masterLoading = true;
    void refreshAll(true).finally(() => {
      syncing = false;
      masterLoading = false;
    });
  } else {
    await refreshAll(false);
    injectQueueEntries();
    syncLocalIds();
  }
  window.addEventListener('online', () => void drainQueue());
}

async function addSingle(payload: AddEntryPayload): Promise<void> {
  const tempId = -(Date.now());
  entries = [...entries, buildEntry(tempId, payload, categories)];
  addPending(tempId);
  masterLoading = true;
  try {
    const outcome = await submitAdd(tempId, payload, () => withTimeout(api.addEntry(payload)));
    removePending(tempId);
    if (outcome.status === 'confirmed') {
      entries = entries.map((e) => (e.id === tempId ? outcome.entry : e));
      addPending(outcome.entry.id);
      await refreshAll(true);
      removePending(outcome.entry.id);
    } else {
      // queued — stays as Local Entry
      syncLocalIds();
      if (outcome.error instanceof UnauthorizedError) showToast(outcome.error, undefined, 'destructive');
    }
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
    const outcome = await submitEdit(id, patch, () => withTimeout(api.updateEntry(id, patch)));
    if (outcome.status === 'confirmed') {
      await refreshAll(true);
    } else if (outcome.status === 'queued') {
      syncLocalIds();
      if (outcome.error instanceof UnauthorizedError) showToast(outcome.error, undefined, 'destructive');
    } else {
      // failed: roll back
      entries = entries.map((e) => (e.id === id ? prev : e));
      showToast(outcome.error);
    }
  } finally {
    removePending(id);
    masterLoading = false;
  }
}

async function deleteEntry(id: number): Promise<void> {
  if (!entries.some((e) => e.id === id)) return;

  const wasLocal = getLocalEntryIds().has(id);
  addDeletePending(id);
  masterLoading = true;
  try {
    const outcome = await submitDelete(id, () => withTimeout(api.deleteEntry(id)));
    if (outcome.status === 'confirmed') {
      entries = entries.filter((e) => e.id !== id);
      await refreshAll(true);
    } else if (outcome.status === 'queued') {
      syncLocalIds();
      if (wasLocal) {
        // Local Entry delete (or direct-enqueue add+delete): remove optimistically
        entries = entries.filter((e) => e.id !== id);
      }
      if (outcome.error instanceof UnauthorizedError) showToast(outcome.error, undefined, 'destructive');
    } else {
      showToast(outcome.error);
    }
  } finally {
    removeDeletePending(id);
    masterLoading = false;
  }
}

async function deleteEntries(ids: number[]): Promise<void> {
  const present = ids.filter((id) => entries.some((e) => e.id === id));
  if (present.length === 0) return;

  const currentLocalIds = getLocalEntryIds();

  // Local (unsynced) entries: coalesce into queue, remove optimistically.
  const localToDelete = present.filter((id) => currentLocalIds.has(id));
  for (const id of localToDelete) {
    await submitDelete(id, () => Promise.resolve());
    entries = entries.filter((e) => e.id !== id);
  }
  syncLocalIds();

  const remote = present.filter((id) => !currentLocalIds.has(id));
  if (remote.length === 0) return;

  for (const id of remote) addDeletePending(id);
  masterLoading = true;
  try {
    const outcomes = await Promise.allSettled(
      remote.map((id) => submitDelete(id, () => withTimeout(api.deleteEntry(id))))
    );
    const removed: number[] = [];
    let failCount = 0;
    for (let i = 0; i < outcomes.length; i++) {
      const id = remote[i];
      const result = outcomes[i];
      if (result.status === 'fulfilled') {
        const outcome = result.value;
        if (outcome.status === 'confirmed') {
          removed.push(id);
        } else if (outcome.status === 'queued') {
          if (outcome.error instanceof UnauthorizedError) showToast(outcome.error, undefined, 'destructive');
        } else {
          failCount++;
        }
      }
    }
    syncLocalIds();
    if (removed.length > 0) entries = entries.filter((e) => !removed.includes(e.id));
    if (failCount > 0) showToast(`Failed to delete ${failCount} entr${failCount === 1 ? 'y' : 'ies'}.`);
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
      add: (payload) => withTimeout(api.addEntry(payload)),
      edit: (id, patch) => withTimeout(api.updateEntry(id, patch)),
      delete: (id) => withTimeout(api.deleteEntry(id)),
    });

    for (const result of results) {
      if (result.status === 'drained') {
        const item = result.item;
        if (item.op === 'add') {
          entries = entries.map((e) => (e.id === item.tempId ? result.entry! : e));
        } else if (item.op === 'delete') {
          entries = entries.filter((e) => e.id !== item.id);
        }
      } else {
        if (result.error instanceof UnauthorizedError) showToast(result.error, undefined, 'destructive');
      }
    }

    syncLocalIds();
    const allDrained = results.length > 0 && results.every((r) => r.status === 'drained');
    if (allDrained) {
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
  get config() { return config; },
  get loading() { return loading; },
  get error() { return error; },
  get errorIsConnection() { return errorIsConnection; },
  get masterLoading() { return masterLoading; },
  get toastMsg() { return toastMsg; },
  get toastAction() { return toastAction; },
  get toastIsConnection() { return toastIsConnection; },
  get toastVariant() { return toastVariant; },
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
  dismissToast: () => { toastMsg = null; toastAction = null; toastIsConnection = false; toastVariant = 'default'; },
};
