import { isQueueable } from './api';
import { createMutationId } from './mutationId';
import type { AddEntryPayload, Entry, UpdateEntryPatch } from './types';

import { financialScope, scopedKey } from './financialScope';

export type QueueItem =
  | { op: "add"; tempId: number; payload: AddEntryPayload; mutationId?: string }
  // A Split Entry / Fund Redistribution batch that failed to reach GAS online.
  // Self-contained: all data needed to replay it as one addEntries lives on
  // this item — see ADR-0004's amendment. Frozen until synced (issue #111):
  // no per-leg edit/delete coalescing is introduced for it.
  | { op: "addBatch"; tempIds: number[]; payloads: AddEntryPayload[]; mutationId?: string }
  | { op: "edit"; id: number; patch: UpdateEntryPatch }
  | { op: "delete"; id: number };

export type AddOutcome =
  | { status: 'confirmed'; entry: Entry }
  | { status: 'queued'; error?: unknown }
  | { status: 'failed'; error: unknown };

export type AddBatchOutcome =
  | { status: 'confirmed'; entries: Entry[] }
  | { status: 'queued'; error?: unknown }
  | { status: 'failed'; error: unknown };

export type MutateOutcome =
  | { status: 'confirmed' }
  | { status: 'queued'; error?: unknown }
  | { status: 'failed'; error: unknown };

export type DrainItemResult =
  | { item: QueueItem; status: 'drained'; entry?: Entry; entries?: Entry[] }
  | { item: QueueItem; status: 'stopped'; error: unknown };

export class QueuePersistenceError extends Error {
  constructor(action: 'read' | 'write', cause: unknown) {
    super(`Couldn't ${action} pending saves on this device. Restore browser storage and try again.`, { cause });
    this.name = 'QueuePersistenceError';
  }
}

export function isLocalEntryId(id: number): boolean {
  return id < 0;
}

export function localEntryIdsFromQueue(queue: QueueItem[]): Set<number> {
  return new Set(
    queue.flatMap((item) => {
      if (item.op === 'add') return [item.tempId];
      if (item.op === 'addBatch') return item.tempIds;
      return [item.id];
    }),
  );
}

function createQueue(scope: string | null) {
  const KEY = scopedKey('ms_queue', scope);
  const memory = new Map<string, string>();
  const storage = scope === null ? { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); } } : localStorage;


  let replaying = false;
  const activeSubmissions = new Set<string>();

  // Queue snapshots are detached JSON values. Match only the first occurrence
  // of each active request so an identical later edit still remains pending.
  function activeIndices(queue: QueueItem[]): Set<number> {
    return new Set([...activeSubmissions].map(key => queue.findIndex(item => JSON.stringify(item) === key)));
  }

  function removeDelivered(item: QueueItem): void {
    const queue = readQueue();
    const key = JSON.stringify(item);
    const index = queue.findIndex(pending => JSON.stringify(pending) === key);
    if (index === -1) throw new Error('The pending request changed during delivery.');
    writeQueue(queue.filter((_, i) => i !== index));
  }

  function readQueue(): QueueItem[] {
    try {
      const raw = storage.getItem(KEY);
      const association = scope === null ? null : readLegacyAssociation();
      const recovered = !raw && association?.scope === scope ? association.raw : null;
      const queue = raw ? JSON.parse(raw) : recovered ? JSON.parse(recovered) : [];
      if (!Array.isArray(queue)) throw new Error('Expected an Offline Queue array');
      if (recovered) writeQueue(queue);
      return queue;
    } catch (cause) {
      throw new QueuePersistenceError('read', cause);
    }
  }

  function writeQueue(q: QueueItem[]): void {
    try {
      storage.setItem(KEY, JSON.stringify(q));
    } catch (cause) {
      throw new QueuePersistenceError('write', cause);
    }
  }

  /** Administrative recovery only: intentionally replaces/discards pending work. */
  function restoreQueueForRecovery(queue: QueueItem[]): void {
    if (replaying || activeSubmissions.size > 0) throw new Error('Wait for pending delivery before restoring the Offline Queue.');
    writeQueue(queue);
  }

  function enqueue(item: QueueItem): void {
    const q = readQueue();

    if (item.op === "add" || item.op === "addBatch") {
      const pendingIds = localEntryIdsFromQueue(q);
      const ids = item.op === 'add' ? [item.tempId] : item.tempIds;
      if (ids.some(id => !Number.isSafeInteger(id) || id >= 0)) {
        throw new Error('New saves require negative temporary Entry IDs.');
      }
      if (ids.some(id => pendingIds.has(id))) {
        throw new Error('A pending save already owns this temporary Entry ID.');
      }
      writeQueue([...q, item]);
      return;
    }

    const key = item.id;
    if (key < 0) throw new Error('This entry is waiting to sync — sync it first, then try again.');
    const active = activeIndices(q);
    const existingIdx = q.findLastIndex(
      (qi, index) => !active.has(index) && (!replaying || index !== 0) && (
        (qi.op === "edit" && qi.id === key) ||
        (qi.op === "delete" && qi.id === key))
    );

    if (existingIdx === -1) {
      writeQueue([...q, item]);
      return;
    }

    const existing = q[existingIdx];

    if (item.op === "edit") {
      const merged = [...q];
      if (existing.op === "edit") {
        merged[existingIdx] = {
          op: "edit",
          id: existing.id,
          patch: { ...existing.patch, ...item.patch },
        };
      } else {
        merged.push(item); // existing is delete — shouldn't happen, safety fallback
      }
      writeQueue(merged);
      return;
    }

    // item.op === "delete"
    const merged = [...q];
    merged[existingIdx] = item;
    writeQueue(merged);
  }

  /** Pending single saves and all legs of pending atomic batches are frozen. */
  function isQueuedAddId(id: number): boolean {
    return readQueue().some((item) =>
      (item.op === 'add' && item.tempId === id)
      || (item.op === 'addBatch' && item.tempIds.includes(id)),
    );
  }

  function getLocalEntryIds(): Set<number> {
    return localEntryIdsFromQueue(readQueue());
  }

  type Submission<T> =
    | { status: 'confirmed'; value: T }
    | { status: 'queued'; error?: unknown }
    | { status: 'failed'; error: unknown };

  // Persist before delivery. Unrelated confirmed-entry operations can retain
  // their independent online lifecycle; work behind an offline/replay item waits.
  async function submit<T>(item: QueueItem, deliver: (saved: QueueItem) => Promise<T>): Promise<Submission<T>> {
    let saved: QueueItem;
    try {
      const queue = readQueue();
      const active = activeIndices(queue);
      const independent = (item.op === 'edit' || item.op === 'delete')
        && queue.every((pending, index) => active.has(index)
          && !((pending.op === 'edit' || pending.op === 'delete') && pending.id === item.id));
      const hasPending = queue.length > 0 && !independent;
      // Delivery receives a detached snapshot, never a caller-owned mutable object.
      saved = JSON.parse(JSON.stringify(item)) as QueueItem;
      enqueue(saved);
      if (hasPending || replaying) return { status: 'queued' };
    } catch (error) {
      return { status: 'failed', error };
    }
    const key = JSON.stringify(saved);
    activeSubmissions.add(key);
    try {
      let value: T;
      try {
        value = await deliver(saved);
      } catch (error) {
        if (isQueueable(error)) return { status: 'queued', error };
        // Definitive validation failures need not be retried. A failed removal
        // still leaves durable pending work, so never report that it disappeared.
        try { removeDelivered(saved); }
        catch (error) { return { status: 'queued', error }; }
        return { status: 'failed', error };
      }
      try { removeDelivered(saved); }
      catch (error) { return { status: 'queued', error }; }
      return { status: 'confirmed', value };
    } finally {
      activeSubmissions.delete(key);
    }
  }

  type AddDelivery = (payload: AddEntryPayload, mutationId: string) => Promise<Entry>;
  type BatchDelivery = (payloads: AddEntryPayload[], mutationId: string) => Promise<Entry[]>;

  async function submitAdd(
    tempId: number,
    payload: AddEntryPayload,
    mutationIdOrTryAdd: string | AddDelivery,
    maybeTryAdd?: AddDelivery,
  ): Promise<AddOutcome> {
    const mutationId = typeof mutationIdOrTryAdd === 'string' ? mutationIdOrTryAdd : createMutationId();
    const deliver = typeof mutationIdOrTryAdd === 'function' ? mutationIdOrTryAdd : maybeTryAdd!;
    const outcome = await submit({ op: 'add', tempId, payload, mutationId }, saved => {
      if (saved.op !== 'add') throw new Error('Expected a single save');
      return deliver(saved.payload, saved.mutationId!);
    });
    return outcome.status === 'confirmed' ? { status: 'confirmed', entry: outcome.value } : outcome;
  }

  async function submitAddBatch(
    tempIds: number[],
    payloads: AddEntryPayload[],
    mutationIdOrTryAddBatch: string | BatchDelivery,
    maybeTryAddBatch?: BatchDelivery,
  ): Promise<AddBatchOutcome> {
    const mutationId = typeof mutationIdOrTryAddBatch === 'string' ? mutationIdOrTryAddBatch : createMutationId();
    const deliver = typeof mutationIdOrTryAddBatch === 'function' ? mutationIdOrTryAddBatch : maybeTryAddBatch!;
    const outcome = await submit({ op: 'addBatch', tempIds, payloads, mutationId }, saved => {
      if (saved.op !== 'addBatch') throw new Error('Expected an atomic batch');
      return deliver(saved.payloads, saved.mutationId!);
    });
    return outcome.status === 'confirmed' ? { status: 'confirmed', entries: outcome.value } : outcome;
  }

  async function submitEdit(
    id: number,
    patch: UpdateEntryPatch,
    tryEdit: (id: number, patch: UpdateEntryPatch) => Promise<void>,
  ): Promise<MutateOutcome> {
    const outcome = await submit({ op: 'edit', id, patch }, saved => {
      if (saved.op !== 'edit') throw new Error('Expected an edit');
      return tryEdit(saved.id, saved.patch);
    });
    return outcome.status === 'confirmed' ? { status: 'confirmed' } : outcome;
  }

  async function submitDelete(
    id: number,
    tryDelete: (id: number) => Promise<void>,
  ): Promise<MutateOutcome> {
    const outcome = await submit({ op: 'delete', id }, saved => {
      if (saved.op !== 'delete') throw new Error('Expected a delete');
      return tryDelete(saved.id);
    });
    return outcome.status === 'confirmed' ? { status: 'confirmed' } : outcome;
  }

  async function drain(callbacks: {
    add: (payload: AddEntryPayload, mutationId: string) => Promise<Entry>;
    addEntries: (payloads: AddEntryPayload[], mutationId: string) => Promise<Entry[]>;
    edit: (id: number, patch: UpdateEntryPatch) => Promise<void>;
    delete: (id: number) => Promise<void>;
    isCurrent?: () => boolean;
  }): Promise<DrainItemResult[]> {
    if (replaying || activeSubmissions.size > 0) return [];
    const results: DrainItemResult[] = [];
    let q = readQueue();

    while (q.length > 0 && (callbacks.isCurrent?.() ?? true)) {
      let item = q[0];
      try {
        replaying = true;
        // Queues created before #149 have no key. Give one a durable identity
        // before the first replay attempt, so a timeout during that replay cannot
        // cause a later attempt to create the Entry twice.
        if ((item.op === 'add' || item.op === 'addBatch') && !item.mutationId) {
          item = { ...item, mutationId: createMutationId() };
          q = [item, ...q.slice(1)];
          writeQueue(q);
        }
        let entry: Entry | undefined;
        let entries: Entry[] | undefined;
        if (item.op === 'add') {
          entry = await callbacks.add(item.payload, item.mutationId);
        } else if (item.op === 'addBatch') {
          entries = await callbacks.addEntries(item.payloads, item.mutationId);
        } else if (item.op === 'edit') {
          await callbacks.edit(item.id, item.patch);
        } else {
          await callbacks.delete(item.id);
        }
        q = readQueue().slice(1);
        writeQueue(q);
        results.push({ item, status: 'drained', entry, entries });
      } catch (err) {
        results.push({ item, status: 'stopped', error: err });
        break;
      } finally {
        replaying = false;
      }
    }

    return results;
  }

  return { readQueue, restoreQueueForRecovery, enqueue, isQueuedAddId, getLocalEntryIds, submitAdd, submitAddBatch, submitEdit, submitDelete, drain };
}

const owners = new Map<string | null, ReturnType<typeof createQueue>>();
export function queueFor(scope: string | null = financialScope()) {
  let owner = owners.get(scope);
  if (!owner) { owner = createQueue(scope); owners.set(scope, owner); }
  return owner;
}

const LEGACY_OWNER = 'ms_queue_legacy_owner';
function readLegacyAssociation(): { scope: string; raw: string } | null {
  const raw = localStorage.getItem(LEGACY_OWNER);
  return raw ? JSON.parse(raw) : null;
}

/** One bounded quarantine: retain the original unscoped bytes, never auto-deliver. */
export function hasLegacyWork(): boolean {
  const raw = localStorage.getItem('ms_queue');
  return raw !== null && raw !== '[]' && !localStorage.getItem(LEGACY_OWNER);
}

/** Caller must explicitly confirm the original destination before association. */
export function associateLegacyWork(scope: string): void {
  if (!hasLegacyWork()) return;
  const owner = queueFor(scope);
  if (owner.readQueue().length > 0) throw new Error('Sync this Connection’s pending saves before recovering older work.');
  const raw = localStorage.getItem('ms_queue')!;
  const items = JSON.parse(raw);
  if (!Array.isArray(items) || items.some(item => !item || !['add', 'addBatch', 'edit', 'delete'].includes(item.op))) {
    throw new Error('Older pending work is unreadable. Its original data is retained on this device.');
  }
  // The durable association is the recovery journal. A crash before the scoped
  // queue is written resumes from these exact bytes, including Mutation IDs.
  localStorage.setItem(LEGACY_OWNER, JSON.stringify({ scope, raw }));
  owner.readQueue();
}
export const readQueue: ReturnType<typeof createQueue>["readQueue"] = (...args) => queueFor().readQueue(...args);
export const restoreQueueForRecovery: ReturnType<typeof createQueue>["restoreQueueForRecovery"] = (...args) => queueFor().restoreQueueForRecovery(...args);
export const enqueue: ReturnType<typeof createQueue>["enqueue"] = (...args) => queueFor().enqueue(...args);
export const isQueuedAddId: ReturnType<typeof createQueue>["isQueuedAddId"] = (...args) => queueFor().isQueuedAddId(...args);
export const getLocalEntryIds: ReturnType<typeof createQueue>["getLocalEntryIds"] = (...args) => queueFor().getLocalEntryIds(...args);
export const submitAdd: ReturnType<typeof createQueue>["submitAdd"] = async (...args) => {
  try { return await queueFor().submitAdd(...args); }
  catch (error) { return { status: 'failed', error }; }
};
export const submitAddBatch: ReturnType<typeof createQueue>["submitAddBatch"] = async (...args) => {
  try { return await queueFor().submitAddBatch(...args); }
  catch (error) { return { status: 'failed', error }; }
};
export const submitEdit: ReturnType<typeof createQueue>["submitEdit"] = async (...args) => {
  try { return await queueFor().submitEdit(...args); }
  catch (error) { return { status: 'failed', error }; }
};
export const submitDelete: ReturnType<typeof createQueue>["submitDelete"] = async (...args) => {
  try { return await queueFor().submitDelete(...args); }
  catch (error) { return { status: 'failed', error }; }
};
export const drain: ReturnType<typeof createQueue>["drain"] = (...args) => queueFor().drain(...args);
