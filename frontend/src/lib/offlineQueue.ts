import type { QueueItem } from './queue';

export function isLocalEntryId(id: number): boolean {
  return id < 0;
}

export function localEntryIdsFromQueue(queue: QueueItem[]): Set<number> {
  return new Set(queue.flatMap((item) => (item.op === 'add' ? [item.tempId] : [item.id])));
}