import { enqueue, readQueue, writeQueue } from './queue';
import type { QueueItem } from './queue';
import { isQueueable } from './api';
import type { Entry, AddEntryPayload, UpdateEntryPatch } from './types';

export type AddOutcome =
  | { status: 'confirmed'; entry: Entry }
  | { status: 'queued'; error?: unknown };

export type MutateOutcome =
  | { status: 'confirmed' }
  | { status: 'queued'; error?: unknown }
  | { status: 'failed'; error: unknown };

export type DrainItemResult =
  | { item: QueueItem; status: 'drained'; entry?: Entry }
  | { item: QueueItem; status: 'stopped'; error: unknown };

export function isLocalEntryId(id: number): boolean {
  return id < 0;
}

export function localEntryIdsFromQueue(queue: QueueItem[]): Set<number> {
  return new Set(queue.flatMap((item) => (item.op === 'add' ? [item.tempId] : [item.id])));
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
  edit: (id: number, patch: UpdateEntryPatch) => Promise<void>;
  delete: (id: number) => Promise<void>;
}): Promise<DrainItemResult[]> {
  const results: DrainItemResult[] = [];
  let q = readQueue();

  while (q.length > 0) {
    const item = q[0];
    try {
      let entry: Entry | undefined;
      if (item.op === 'add') {
        entry = await callbacks.add(item.payload);
      } else if (item.op === 'edit') {
        await callbacks.edit(item.id, item.patch);
      } else {
        await callbacks.delete(item.id);
      }
      q = q.slice(1);
      writeQueue(q);
      results.push({ item, status: 'drained', entry });
    } catch (err) {
      results.push({ item, status: 'stopped', error: err });
      break;
    }
  }

  return results;
}
