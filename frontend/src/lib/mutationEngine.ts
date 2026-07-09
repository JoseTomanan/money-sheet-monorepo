import { submitAdd, submitAddBatch, submitEdit, submitDelete, drain, getLocalEntryIds, isBatchLegId } from './offlineMutation';
import { buildEntry, getMainCategory } from './domain';
import { isAuthError } from './api';
import { readQueue } from './queue';
import type { Entry, CategoryMap, AddEntryPayload, UpdateEntryPatch } from './types';

// ---------------------------------------------------------------------------
// EntryStore seam — all state reads/writes go through this interface so the
// engine can be tested without Svelte runes.
// ---------------------------------------------------------------------------
export interface EntryStoreSeam {
  getEntries(): Entry[];
  getCategories(): CategoryMap;
  appendEntry(entry: Entry): void;
  swapEntry(matchId: number, next: Entry): void;
  removeEntry(id: number): void;
  removeEntries(ids: number[]): void;
  setPending(id: number, active: boolean): void;
  setDeletePending(id: number, active: boolean): void;
  setMasterLoading(active: boolean): void;
  showToast(msgOrErr: unknown, variant?: 'default' | 'destructive'): void;
  clearToast(): void;
  syncLocalIds(): void;
  refreshAll(): Promise<void>;
}

// API callbacks injected by the store — the adapter seam owns request timeout.
export interface MutationApi {
  addEntry(payload: AddEntryPayload): Promise<Entry>;
  addEntries(payloads: AddEntryPayload[]): Promise<Entry[]>;
  updateEntry(id: number, patch: UpdateEntryPatch): Promise<void>;
  deleteEntry(id: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// Monotonic temp-id generator — strictly decreasing negatives, never collide.
// ---------------------------------------------------------------------------
let _nextId = -1;
export function nextTempId(): number { return _nextId--; }
export function _resetTempIdCounter(): void { _nextId = -1; }

// A leg of a queued (not-yet-synced) batch add is read-only until it syncs —
// no per-leg coalescing rules are introduced for it (ADR-0004 amendment).
const BATCH_FROZEN_MESSAGE = "This entry is part of a split that hasn't synced yet — sync it first, then try again.";

// ---------------------------------------------------------------------------
// Engine factory
// ---------------------------------------------------------------------------
export function createMutationEngine(seam: EntryStoreSeam, mutApi: MutationApi) {

  async function add(payload: AddEntryPayload): Promise<void> {
    const tempId = nextTempId();
    seam.appendEntry(buildEntry(tempId, payload, seam.getCategories()));
    seam.setPending(tempId, true);
    seam.setMasterLoading(true);
    try {
      const outcome = await submitAdd(tempId, payload, () => mutApi.addEntry(payload));
      seam.setPending(tempId, false);
      if (outcome.status === 'confirmed') {
        seam.swapEntry(tempId, outcome.entry);
        seam.setPending(outcome.entry.id, true);
        await seam.refreshAll();
        seam.setPending(outcome.entry.id, false);
      } else {
        seam.syncLocalIds();
        if (isAuthError(outcome.error)) {
          seam.showToast(outcome.error, 'destructive');
        }
      }
    } finally {
      seam.setMasterLoading(false);
    }
  }

  // Split Entry / Fund Redistribution legs are submitted as one atomic
  // addEntries POST under a single GAS document lock (issue #111): the
  // server assigns array-order ids, so no client-side sequencing is needed
  // to keep the main leg's id lowest (contrast the old per-leg awaiting).
  async function addLegs(legs: AddEntryPayload[]): Promise<void> {
    const tempIds = legs.map(() => nextTempId());
    for (let i = 0; i < legs.length; i++) {
      seam.appendEntry(buildEntry(tempIds[i], legs[i], seam.getCategories()));
    }
    for (const id of tempIds) seam.setPending(id, true);
    seam.setMasterLoading(true);
    try {
      const outcome = await submitAddBatch(tempIds, legs, () => mutApi.addEntries(legs));
      for (const id of tempIds) seam.setPending(id, false);

      if (outcome.status === 'confirmed') {
        for (let i = 0; i < tempIds.length; i++) {
          seam.swapEntry(tempIds[i], outcome.entries[i]);
        }
      }
      seam.syncLocalIds();

      if (outcome.status === 'queued' && isAuthError(outcome.error)) {
        seam.showToast(outcome.error, 'destructive');
      } else if (outcome.status === 'confirmed') {
        seam.clearToast();
      }
      await seam.refreshAll();
    } finally {
      seam.setMasterLoading(false);
    }
  }

  async function edit(id: number, patch: UpdateEntryPatch): Promise<void> {
    const prev = seam.getEntries().find((e) => e.id === id);
    if (!prev) return;
    if (isBatchLegId(id)) {
      seam.showToast(BATCH_FROZEN_MESSAGE);
      return;
    }
    const optimistic: Entry = {
      ...prev,
      ...patch,
      mainCategory: patch.tag
        ? getMainCategory(patch.tag, seam.getCategories())
        : prev.mainCategory,
    };
    seam.swapEntry(id, optimistic);
    seam.setPending(id, true);
    seam.setMasterLoading(true);
    try {
      const outcome = await submitEdit(id, patch, () => mutApi.updateEntry(id, patch));
      if (outcome.status === 'confirmed') {
        await seam.refreshAll();
      } else if (outcome.status === 'queued') {
        seam.syncLocalIds();
        if (isAuthError(outcome.error)) seam.showToast(outcome.error, 'destructive');
      } else {
        seam.swapEntry(id, prev);
        seam.showToast(outcome.error);
      }
    } finally {
      seam.setPending(id, false);
      seam.setMasterLoading(false);
    }
  }

  async function remove(id: number, entries: Entry[]): Promise<void> {
    if (!entries.some((e) => e.id === id)) return;
    if (isBatchLegId(id)) {
      seam.showToast(BATCH_FROZEN_MESSAGE);
      return;
    }
    const wasLocal = getLocalEntryIds().has(id);
    seam.setDeletePending(id, true);
    seam.setMasterLoading(true);
    try {
      const outcome = await submitDelete(id, () => mutApi.deleteEntry(id));
      if (outcome.status === 'confirmed') {
        seam.removeEntry(id);
        await seam.refreshAll();
      } else if (outcome.status === 'queued') {
        seam.syncLocalIds();
        if (wasLocal) seam.removeEntry(id);
        if (isAuthError(outcome.error)) seam.showToast(outcome.error, 'destructive');
      } else {
        seam.showToast(outcome.error);
      }
    } finally {
      seam.setDeletePending(id, false);
      seam.setMasterLoading(false);
    }
  }

  async function removeMany(ids: number[], entries: Entry[]): Promise<void> {
    const present = ids.filter((id) => entries.some((e) => e.id === id));
    if (present.length === 0) return;

    // Legs of a queued (not-yet-synced) batch are frozen: skip them and tell
    // the user to sync first, same as a single edit/delete on a batch leg.
    const frozen = present.filter((id) => isBatchLegId(id));
    const deletable = present.filter((id) => !isBatchLegId(id));
    if (frozen.length > 0) seam.showToast(BATCH_FROZEN_MESSAGE);
    if (deletable.length === 0) return;

    const currentLocalIds = getLocalEntryIds();

    // Local (unsynced) entries: coalesce into queue, remove optimistically.
    const localToDelete = deletable.filter((id) => currentLocalIds.has(id));
    for (const id of localToDelete) {
      await submitDelete(id, () => Promise.resolve());
      seam.removeEntry(id);
    }
    seam.syncLocalIds();

    const remote = deletable.filter((id) => !currentLocalIds.has(id));
    if (remote.length === 0) return;

    for (const id of remote) seam.setDeletePending(id, true);
    seam.setMasterLoading(true);
    try {
      const outcomes = await Promise.allSettled(
        remote.map((id) => submitDelete(id, () => mutApi.deleteEntry(id)))
      );
      const removed: number[] = [];
      let failCount = 0;
      for (let i = 0; i < outcomes.length; i++) {
        const result = outcomes[i];
        if (result.status === 'fulfilled') {
          const outcome = result.value;
          if (outcome.status === 'confirmed') {
            removed.push(remote[i]);
          } else if (outcome.status === 'queued') {
            if (isAuthError(outcome.error)) seam.showToast(outcome.error, 'destructive');
          } else {
            failCount++;
          }
        }
      }
      seam.syncLocalIds();
      if (removed.length > 0) seam.removeEntries(removed);
      if (failCount > 0) seam.showToast(`Failed to delete ${failCount} entr${failCount === 1 ? 'y' : 'ies'}.`);
      await seam.refreshAll();
    } finally {
      for (const id of remote) seam.setDeletePending(id, false);
      seam.setMasterLoading(false);
    }
  }

  async function drainQueue(): Promise<void> {
    const results = await drain({
      add: mutApi.addEntry,
      addEntries: mutApi.addEntries,
      edit: mutApi.updateEntry,
      delete: mutApi.deleteEntry,
    });

    for (const result of results) {
      if (result.status === 'drained') {
        const item = result.item;
        if (item.op === 'add') {
          seam.swapEntry(item.tempId, result.entry!);
        } else if (item.op === 'addBatch') {
          for (let i = 0; i < item.tempIds.length; i++) {
            seam.swapEntry(item.tempIds[i], result.entries![i]);
          }
        } else if (item.op === 'delete') {
          seam.removeEntry(item.id);
        }
      } else {
        if (isAuthError(result.error)) seam.showToast(result.error, 'destructive');
      }
    }

    seam.syncLocalIds();
    const allDrained = results.length > 0 && results.every((r) => r.status === 'drained');
    if (allDrained) await seam.refreshAll();
  }

  // Re-derive Local Entries from the persisted Offline Queue onto freshly-fetched
  // entries. Reuses the same buildEntry/getMainCategory logic as add/edit above,
  // so entry-building has a single owner instead of a second copy in the store.
  function injectQueue(): void {
    for (const item of readQueue()) {
      if (item.op === 'add') {
        if (!seam.getEntries().some((e) => e.id === item.tempId)) {
          seam.appendEntry(buildEntry(item.tempId, item.payload, seam.getCategories()));
        }
      } else if (item.op === 'addBatch') {
        for (let i = 0; i < item.tempIds.length; i++) {
          if (!seam.getEntries().some((e) => e.id === item.tempIds[i])) {
            seam.appendEntry(buildEntry(item.tempIds[i], item.payloads[i], seam.getCategories()));
          }
        }
      } else if (item.op === 'edit') {
        const prev = seam.getEntries().find((e) => e.id === item.id);
        if (prev) {
          seam.swapEntry(item.id, {
            ...prev,
            ...item.patch,
            mainCategory: item.patch.tag
              ? getMainCategory(item.patch.tag, seam.getCategories())
              : prev.mainCategory,
          });
        }
      }
      // delete items: entry stays visible until drained
    }
  }

  return { add, addLegs, edit, remove, removeMany, drainQueue, injectQueue };
}
