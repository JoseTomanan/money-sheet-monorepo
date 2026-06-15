import { describe, it, expect } from 'vitest';
import { isLocalEntryId, localEntryIdsFromQueue } from './offlineQueue';
import type { QueueItem } from './queue';

describe('offlineQueue identity helpers', () => {
  it('treats negative IDs as Local Entries', () => {
    expect(isLocalEntryId(-1)).toBe(true);
    expect(isLocalEntryId(0)).toBe(false);
    expect(isLocalEntryId(42)).toBe(false);
  });

  it('derives Local Entry IDs from the queued mutations', () => {
    const queue: QueueItem[] = [
      { op: 'add', tempId: -101, payload: { date: '2026-01-01', tag: 'Groceries', description: 'queued', direction: 'O', amount: 50 } },
      { op: 'edit', id: 7, patch: { description: 'updated' } },
      { op: 'delete', id: -202 },
    ];

    expect(localEntryIdsFromQueue(queue)).toEqual(new Set([-101, 7, -202]));
  });
});