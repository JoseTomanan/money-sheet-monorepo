import { submitAdd, submitEdit, submitDelete, drain, getLocalEntryIds } from './offlineMutation';
import { buildEntry, getMainCategory } from './domain';
import { isAuthError } from './api';
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
  updateEntry(id: number, patch: UpdateEntryPatch): Promise<void>;
  deleteEntry(id: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// Monotonic temp-id generator — strictly decreasing negatives, never collide.
// ---------------------------------------------------------------------------
let _nextId = -1;
export function nextTempId(): number { return _nextId--; }
export function _resetTempIdCounter(): void { _nextId = -1; }

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

  async function addLegs(legs: AddEntryPayload[]): Promise<void> {
    const tempIds = legs.map(() => nextTempId());
    for (let i = 0; i < legs.length; i++) {
      seam.appendEntry(buildEntry(tempIds[i], legs[i], seam.getCategories()));
    }
    for (const id of tempIds) seam.setPending(id, true);
    seam.setMasterLoading(true);
    try {
      // Main leg must confirm before ditto legs fire: GAS assigns IDs in lock-acquisition
      // order, so a ditto leg racing the main leg could win a lower ID, breaking
      // splitRunPositions' "main leg first" grouping.
      const mainOutcome = await submitAdd(tempIds[0], legs[0], () => mutApi.addEntry(legs[0]));
      const dittoOutcomes = await Promise.all(
        legs.slice(1).map((leg, i) =>
          submitAdd(tempIds[i + 1], leg, () => mutApi.addEntry(leg))
        )
      );
      const outcomes = [mainOutcome, ...dittoOutcomes];

      for (let i = 0; i < outcomes.length; i++) {
        seam.setPending(tempIds[i], false);
        if (outcomes[i].status === 'confirmed') {
          seam.swapEntry(tempIds[i], (outcomes[i] as { status: 'confirmed'; entry: Entry }).entry);
        }
      }
      seam.syncLocalIds();

      const authErr = outcomes.find(
        (o) => o.status === 'queued' && isAuthError(o.error)
      );
      if (authErr) {
        seam.showToast((authErr as { error: unknown }).error, 'destructive');
      } else if (outcomes.every((o) => o.status === 'confirmed')) {
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

    const currentLocalIds = getLocalEntryIds();

    // Local (unsynced) entries: coalesce into queue, remove optimistically.
    const localToDelete = present.filter((id) => currentLocalIds.has(id));
    for (const id of localToDelete) {
      await submitDelete(id, () => Promise.resolve());
      seam.removeEntry(id);
    }
    seam.syncLocalIds();

    const remote = present.filter((id) => !currentLocalIds.has(id));
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
      edit: mutApi.updateEntry,
      delete: mutApi.deleteEntry,
    });

    for (const result of results) {
      if (result.status === 'drained') {
        const item = result.item;
        if (item.op === 'add') {
          seam.swapEntry(item.tempId, result.entry!);
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

  return { add, addLegs, edit, remove, removeMany, drainQueue };
}
