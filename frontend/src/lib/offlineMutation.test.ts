import { describe, it, expect, beforeEach } from 'vitest';
import { isLocalEntryId, getLocalEntryIds } from './offlineMutation';
import { writeQueue } from './queue';

// ---------------------------------------------------------------------------
// Slice 1 (tracer bullet) — identity helpers
// ---------------------------------------------------------------------------

describe('offlineMutation — identity', () => {
  beforeEach(() => localStorage.clear());

  it('isLocalEntryId: negative IDs are Local Entries', () => {
    expect(isLocalEntryId(-1)).toBe(true);
    expect(isLocalEntryId(-9999)).toBe(true);
    expect(isLocalEntryId(0)).toBe(false);
    expect(isLocalEntryId(1)).toBe(false);
    expect(isLocalEntryId(42)).toBe(false);
  });

  it('getLocalEntryIds: derives Set from persisted queue', () => {
    writeQueue([
      { op: 'add', tempId: -101, payload: { date: '2026-01-01', tag: 'Groceries', description: 'q', direction: 'O', amount: 50 } },
      { op: 'edit', id: 7, patch: { description: 'updated' } },
      { op: 'delete', id: -202 },
    ]);
    expect(getLocalEntryIds()).toEqual(new Set([-101, 7, -202]));
  });

  it('getLocalEntryIds: returns empty set when queue is empty', () => {
    expect(getLocalEntryIds()).toEqual(new Set());
  });

  it('getLocalEntryIds: derives every tempId from a queued addBatch item', () => {
    writeQueue([
      { op: 'addBatch', tempIds: [-1, -2], payloads: [
        { date: '2026-01-01', tag: 'Groceries', description: 'split', direction: 'O', amount: 40 },
        { date: '2026-01-01', tag: 'Groceries', description: '^^', direction: 'O', amount: 60 },
      ] },
    ]);
    expect(getLocalEntryIds()).toEqual(new Set([-1, -2]));
  });
});

// ---------------------------------------------------------------------------
// Slice 2 — submitAdd success path
// ---------------------------------------------------------------------------

import { submitAdd } from './offlineMutation';
import type { Entry } from './types';

const REAL_ENTRY: Entry = {
  id: 77,
  date: '2026-01-01',
  tag: 'Groceries',
  mainCategory: 'FOOD',
  description: 'queued',
  direction: 'O',
  amount: 50,
};

describe('offlineMutation — submitAdd success', () => {
  beforeEach(() => localStorage.clear());

  it('returns confirmed with the real entry when tryAdd resolves', async () => {
    const outcome = await submitAdd(-1, { date: '2026-01-01', tag: 'Groceries', description: 'test', direction: 'O', amount: 50 }, () => Promise.resolve(REAL_ENTRY));
    expect(outcome.status).toBe('confirmed');
    if (outcome.status === 'confirmed') expect(outcome.entry).toEqual(REAL_ENTRY);
  });

  it('leaves the queue empty on success', async () => {
    await submitAdd(-1, { date: '2026-01-01', tag: 'Groceries', description: 'test', direction: 'O', amount: 50 }, () => Promise.resolve(REAL_ENTRY));
    expect(getLocalEntryIds().size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Slice 3 — submitAdd failure → enqueued (any error)
// ---------------------------------------------------------------------------

describe('offlineMutation — submitAdd failure', () => {
  beforeEach(() => localStorage.clear());

  it('returns queued when tryAdd rejects', async () => {
    const outcome = await submitAdd(-1001, { date: '2026-01-01', tag: 'Groceries', description: 'test', direction: 'O', amount: 50 }, () => Promise.reject(new Error('Network error')));
    expect(outcome.status).toBe('queued');
  });

  it('enqueues the add item with the given tempId', async () => {
    const payload = { date: '2026-01-01', tag: 'Groceries', description: 'test', direction: 'O' as const, amount: 50 };
    await submitAdd(-1001, payload, () => Promise.reject(new Error('Network error')));
    const ids = getLocalEntryIds();
    expect(ids.has(-1001)).toBe(true);
  });

  it('enqueues even on non-connection errors (add never fails permanently)', async () => {
    await submitAdd(-2000, { date: '2026-01-01', tag: 'Groceries', description: 'test', direction: 'O', amount: 50 }, () => Promise.reject(new Error('API returned error')));
    expect(getLocalEntryIds().has(-2000)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Slice 3b — submitAddBatch (issue #111: atomic Split Entry / Fund Redistribution)
// ---------------------------------------------------------------------------

import { submitAddBatch } from './offlineMutation';

const LEG_A = { date: '2026-01-01', tag: 'Groceries', description: 'split', direction: 'O' as const, amount: 40 };
const LEG_B = { date: '2026-01-01', tag: 'Groceries', description: '^^', direction: 'O' as const, amount: 60 };
const REAL_ENTRIES: Entry[] = [
  { id: 77, date: '2026-01-01', tag: 'Groceries', mainCategory: 'FOOD', description: 'split', direction: 'O', amount: 40 },
  { id: 78, date: '2026-01-01', tag: 'Groceries', mainCategory: 'FOOD', description: '^^', direction: 'O', amount: 60 },
];

describe('offlineMutation — submitAddBatch success', () => {
  beforeEach(() => localStorage.clear());

  it('returns confirmed with entries in array order when tryAddBatch resolves', async () => {
    const outcome = await submitAddBatch([-1, -2], [LEG_A, LEG_B], () => Promise.resolve(REAL_ENTRIES));
    expect(outcome.status).toBe('confirmed');
    if (outcome.status === 'confirmed') expect(outcome.entries).toEqual(REAL_ENTRIES);
  });

  it('leaves the queue empty on success', async () => {
    await submitAddBatch([-1, -2], [LEG_A, LEG_B], () => Promise.resolve(REAL_ENTRIES));
    expect(getLocalEntryIds().size).toBe(0);
  });
});

describe('offlineMutation — submitAddBatch failure', () => {
  beforeEach(() => localStorage.clear());

  it('returns queued and enqueues exactly one addBatch item (not per-leg) when tryAddBatch rejects', async () => {
    const outcome = await submitAddBatch([-1, -2], [LEG_A, LEG_B], () => Promise.reject(new Error('Network error')));
    expect(outcome.status).toBe('queued');
    const q = readQueue();
    expect(q).toHaveLength(1);
    expect(q[0].op).toBe('addBatch');
    if (q[0].op === 'addBatch') {
      expect(q[0].tempIds).toEqual([-1, -2]);
      expect(q[0].payloads).toEqual([LEG_A, LEG_B]);
    }
  });

  it('all legs become Local Entries after a queued batch', async () => {
    await submitAddBatch([-5, -6], [LEG_A, LEG_B], () => Promise.reject(new Error('offline')));
    expect(getLocalEntryIds()).toEqual(new Set([-5, -6]));
  });
});

// ---------------------------------------------------------------------------
// Slice 4 — submitEdit
// ---------------------------------------------------------------------------

import { submitEdit } from './offlineMutation';
import { ConnectionError } from './adapter-real';
import { readQueue } from './queue';

describe('offlineMutation — submitEdit', () => {
  beforeEach(() => localStorage.clear());

  it('returns confirmed when tryEdit resolves', async () => {
    const outcome = await submitEdit(1, { description: 'updated' }, () => Promise.resolve());
    expect(outcome.status).toBe('confirmed');
  });

  it('returns queued and enqueues on ConnectionError', async () => {
    const outcome = await submitEdit(1, { description: 'updated' }, () => Promise.reject(new ConnectionError('offline')));
    expect(outcome.status).toBe('queued');
    const q = readQueue();
    expect(q).toHaveLength(1);
    expect(q[0].op).toBe('edit');
    if (q[0].op === 'edit') {
      expect(q[0].id).toBe(1);
      expect(q[0].patch.description).toBe('updated');
    }
  });

  it('returns failed on non-connection error (rollback is caller responsibility)', async () => {
    const outcome = await submitEdit(1, { description: 'updated' }, () => Promise.reject(new Error('API error')));
    expect(outcome.status).toBe('failed');
    expect(readQueue()).toHaveLength(0);
  });

  it('enqueues directly for a Local Entry without calling tryEdit', async () => {
    // seed a queued add so the local entry is in the queue
    writeQueue([{ op: 'add', tempId: -1001, payload: { date: '2026-01-01', tag: 'Groceries', description: 'local', direction: 'O', amount: 50 } }]);
    let called = false;
    const outcome = await submitEdit(-1001, { amount: 99 }, () => { called = true; return Promise.resolve(); });
    expect(called).toBe(false);
    expect(outcome.status).toBe('queued');
    // add+edit → coalesced into single add with merged payload
    const q = readQueue();
    expect(q).toHaveLength(1);
    expect(q[0].op).toBe('add');
    if (q[0].op === 'add') expect(q[0].payload.amount).toBe(99);
  });
});

// ---------------------------------------------------------------------------
// Slice 5 — submitDelete
// ---------------------------------------------------------------------------

import { submitDelete } from './offlineMutation';

describe('offlineMutation — submitDelete', () => {
  beforeEach(() => localStorage.clear());

  it('returns confirmed when tryDelete resolves', async () => {
    const outcome = await submitDelete(1, () => Promise.resolve());
    expect(outcome.status).toBe('confirmed');
  });

  it('returns queued and enqueues on ConnectionError', async () => {
    const outcome = await submitDelete(1, () => Promise.reject(new ConnectionError('offline')));
    expect(outcome.status).toBe('queued');
    const q = readQueue();
    expect(q).toHaveLength(1);
    expect(q[0].op).toBe('delete');
    if (q[0].op === 'delete') expect(q[0].id).toBe(1);
  });

  it('returns failed on non-connection error', async () => {
    const outcome = await submitDelete(1, () => Promise.reject(new Error('API error')));
    expect(outcome.status).toBe('failed');
    expect(readQueue()).toHaveLength(0);
  });

  it('enqueues directly for a Local Entry (add+delete = net zero)', async () => {
    writeQueue([{ op: 'add', tempId: -1001, payload: { date: '2026-01-01', tag: 'Groceries', description: 'local', direction: 'O', amount: 50 } }]);
    let called = false;
    const outcome = await submitDelete(-1001, () => { called = true; return Promise.resolve(); });
    expect(called).toBe(false);
    expect(outcome.status).toBe('queued');
    // add+delete → net zero: queue empty
    expect(readQueue()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Slice 6 — ADR-0004 coalescing via module interface (all four rules)
// ---------------------------------------------------------------------------

describe('offlineMutation — ADR-0004 coalescing', () => {
  beforeEach(() => localStorage.clear());

  // Rule 1: add A + edit A → merged add (covered in submitEdit local-entry test above)
  // Here we verify the merged payload in isolation
  it('add + edit on local entry → single add with merged fields', async () => {
    await submitAdd(-1001, { date: '2026-01-01', tag: 'Groceries', description: 'orig', direction: 'O', amount: 50 }, () => Promise.reject(new Error('offline')));
    await submitEdit(-1001, { amount: 75, description: 'updated' }, () => Promise.resolve());
    const q = readQueue();
    expect(q).toHaveLength(1);
    expect(q[0].op).toBe('add');
    if (q[0].op === 'add') {
      expect(q[0].payload.amount).toBe(75);
      expect(q[0].payload.description).toBe('updated');
      expect(q[0].payload.date).toBe('2026-01-01'); // untouched fields preserved
    }
  });

  // Rule 2: add A + delete A → net zero (covered in submitDelete local-entry test above)
  it('add + delete on local entry → empty queue', async () => {
    await submitAdd(-1002, { date: '2026-01-01', tag: 'Dining', description: 'to delete', direction: 'O', amount: 20 }, () => Promise.reject(new Error('offline')));
    await submitDelete(-1002, () => Promise.resolve());
    expect(readQueue()).toHaveLength(0);
  });

  // Rule 3: edit #N + edit #N → merged edit
  it('edit + edit on same real entry → single edit with latest patch', async () => {
    await submitEdit(42, { description: 'first' }, () => Promise.reject(new ConnectionError('offline')));
    await submitEdit(42, { description: 'second', amount: 100 }, () => Promise.reject(new ConnectionError('offline')));
    const q = readQueue();
    expect(q).toHaveLength(1);
    expect(q[0].op).toBe('edit');
    if (q[0].op === 'edit') {
      expect(q[0].patch.description).toBe('second');
      expect(q[0].patch.amount).toBe(100);
    }
  });

  // Rule 4: edit #N + delete #N → single delete
  it('edit + delete on same real entry → single delete', async () => {
    await submitEdit(42, { description: 'edited' }, () => Promise.reject(new ConnectionError('offline')));
    await submitDelete(42, () => Promise.reject(new ConnectionError('offline')));
    const q = readQueue();
    expect(q).toHaveLength(1);
    expect(q[0].op).toBe('delete');
    if (q[0].op === 'delete') expect(q[0].id).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// Slice 7 — drain
// ---------------------------------------------------------------------------

import { drain } from './offlineMutation';
import type { AddEntryPayload as AEP } from './types';

const BASE_PAYLOAD: AEP = { date: '2026-01-01', tag: 'Groceries', description: 'q', direction: 'O', amount: 50 };

describe('offlineMutation — drain', () => {
  beforeEach(() => localStorage.clear());

  it('drains an add item: returns drained result with real entry, queue emptied', async () => {
    writeQueue([{ op: 'add', tempId: -1001, payload: BASE_PAYLOAD }]);
    const results = await drain({
      add: () => Promise.resolve(REAL_ENTRY),
      addEntries: () => Promise.resolve([]),
      edit: () => Promise.resolve(),
      delete: () => Promise.resolve(),
    });
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('drained');
    if (results[0].status === 'drained') expect(results[0].entry).toEqual(REAL_ENTRY);
    expect(readQueue()).toHaveLength(0);
  });

  it('drains an edit item: returns drained result, queue emptied', async () => {
    writeQueue([{ op: 'edit', id: 1, patch: { description: 'updated' } }]);
    const results = await drain({
      add: () => Promise.resolve(REAL_ENTRY),
      addEntries: () => Promise.resolve([]),
      edit: () => Promise.resolve(),
      delete: () => Promise.resolve(),
    });
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('drained');
    expect(readQueue()).toHaveLength(0);
  });

  it('drains a delete item: returns drained result, queue emptied', async () => {
    writeQueue([{ op: 'delete', id: 1 }]);
    const results = await drain({
      add: () => Promise.resolve(REAL_ENTRY),
      addEntries: () => Promise.resolve([]),
      edit: () => Promise.resolve(),
      delete: () => Promise.resolve(),
    });
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('drained');
    expect(readQueue()).toHaveLength(0);
  });

  it('empty queue: returns empty results array', async () => {
    const results = await drain({
      add: () => Promise.resolve(REAL_ENTRY),
      addEntries: () => Promise.resolve([]),
      edit: () => Promise.resolve(),
      delete: () => Promise.resolve(),
    });
    expect(results).toHaveLength(0);
  });

  it('stops at first failure; committed items removed from queue', async () => {
    writeQueue([
      { op: 'add', tempId: -1001, payload: BASE_PAYLOAD },
      { op: 'add', tempId: -1002, payload: { ...BASE_PAYLOAD, amount: 99 } },
    ]);
    let callCount = 0;
    const results = await drain({
      add: () => {
        callCount++;
        if (callCount === 1) return Promise.resolve(REAL_ENTRY);
        return Promise.reject(new Error('Network error'));
      },
      addEntries: () => Promise.resolve([]),
      edit: () => Promise.resolve(),
      delete: () => Promise.resolve(),
    });
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('drained');
    expect(results[1].status).toBe('stopped');
    // first item removed, second still in queue
    const remaining = readQueue();
    expect(remaining).toHaveLength(1);
    if (remaining[0].op === 'add') expect(remaining[0].tempId).toBe(-1002);
  });

  it('drains an addBatch item as one call: returns entries in order, queue emptied', async () => {
    writeQueue([{ op: 'addBatch', tempIds: [-1, -2], payloads: [LEG_A, LEG_B] }]);
    let addEntriesCallCount = 0;
    const results = await drain({
      add: () => Promise.resolve(REAL_ENTRY),
      addEntries: (payloads) => {
        addEntriesCallCount++;
        expect(payloads).toEqual([LEG_A, LEG_B]);
        return Promise.resolve(REAL_ENTRIES);
      },
      edit: () => Promise.resolve(),
      delete: () => Promise.resolve(),
    });
    expect(addEntriesCallCount).toBe(1);
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('drained');
    if (results[0].status === 'drained') expect(results[0].entries).toEqual(REAL_ENTRIES);
    expect(readQueue()).toHaveLength(0);
  });
});
