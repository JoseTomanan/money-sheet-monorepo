import { enqueue, readQueue, writeQueue } from './queue';
import type { QueueItem } from './queue';
import { isQueueable } from './api';
import type { Entry, AddEntryPayload, UpdateEntryPatch } from './types';

export type AddOutcome =
  | { status: 'confirmed'; entry: Entry }
  | { status: 'queued'; error?: unknown };

export type AddBatchOutcome =
  | { status: 'confirmed'; entries: Entry[] }
  | { status: 'queued'; error?: unknown };

export type MutateOutcome =
  | { status: 'confirmed' }
  | { status: 'queued'; error?: unknown }
  | { status: 'failed'; error: unknown };

export type DrainItemResult =
  | { item: QueueItem; status: 'drained'; entry?: Entry; entries?: Entry[] }
  | { item: QueueItem; status: 'stopped'; error: unknown };

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

/** True when `id` is a leg of a batch currently sitting in the queue (frozen until synced). */
export function isBatchLegId(id: number): boolean {
  return readQueue().some((item) => item.op === 'addBatch' && item.tempIds.includes(id));
}

export function getLocalEntryIds(): Set<number> {
  return localEntryIdsFromQueue(readQueue());
}

export async function submitAdd(
  tempId: number,
  payload: AddEntryPayload,
  tryAdd: () => Promise<Entry>,
): Promise<AddOutcome> {
  try {
    const entry = await tryAdd();
    return { status: 'confirmed', entry };
  } catch (err) {
    enqueue({ op: 'add', tempId, payload });
    return { status: 'queued', error: err };
  }
}

/**
 * Submits a Split Entry / Fund Redistribution as one atomic addEntries call.
 * On failure, enqueues a single `addBatch` item (not one item per leg) — the
 * whole batch replays as one addEntries call when the queue drains.
 */
export async function submitAddBatch(
  tempIds: number[],
  payloads: AddEntryPayload[],
  tryAddBatch: () => Promise<Entry[]>,
): Promise<AddBatchOutcome> {
  try {
    const entries = await tryAddBatch();
    return { status: 'confirmed', entries };
  } catch (err) {
    enqueue({ op: 'addBatch', tempIds, payloads });
    return { status: 'queued', error: err };
  }
}

export async function submitEdit(
  id: number,
  patch: UpdateEntryPatch,
  tryEdit: () => Promise<void>,
): Promise<MutateOutcome> {
  if (getLocalEntryIds().has(id)) {
    enqueue({ op: 'edit', id, patch });
    return { status: 'queued' };
  }
  try {
    await tryEdit();
    return { status: 'confirmed' };
  } catch (err) {
    if (isQueueable(err)) {
      enqueue({ op: 'edit', id, patch });
      return { status: 'queued', error: err };
    }
    return { status: 'failed', error: err };
  }
}

export async function submitDelete(
  id: number,
  tryDelete: () => Promise<void>,
): Promise<MutateOutcome> {
  if (getLocalEntryIds().has(id)) {
    enqueue({ op: 'delete', id });
    return { status: 'queued' };
  }
  try {
    await tryDelete();
    return { status: 'confirmed' };
  } catch (err) {
    if (isQueueable(err)) {
      enqueue({ op: 'delete', id });
      return { status: 'queued', error: err };
    }
    return { status: 'failed', error: err };
  }
}

export async function drain(callbacks: {
  add: (payload: AddEntryPayload) => Promise<Entry>;
  addEntries: (payloads: AddEntryPayload[]) => Promise<Entry[]>;
  edit: (id: number, patch: UpdateEntryPatch) => Promise<void>;
  delete: (id: number) => Promise<void>;
}): Promise<DrainItemResult[]> {
  const results: DrainItemResult[] = [];
  let q = readQueue();

  while (q.length > 0) {
    const item = q[0];
    try {
      let entry: Entry | undefined;
      let entries: Entry[] | undefined;
      if (item.op === 'add') {
        entry = await callbacks.add(item.payload);
      } else if (item.op === 'addBatch') {
        entries = await callbacks.addEntries(item.payloads);
      } else if (item.op === 'edit') {
        await callbacks.edit(item.id, item.patch);
      } else {
        await callbacks.delete(item.id);
      }
      q = q.slice(1);
      writeQueue(q);
      results.push({ item, status: 'drained', entry, entries });
    } catch (err) {
      results.push({ item, status: 'stopped', error: err });
      break;
    }
  }

  return results;
}
