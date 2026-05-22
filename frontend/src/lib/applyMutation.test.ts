import { describe, it, expect, vi } from 'vitest';
import { applyMutation } from './applyMutation';
import type { EntryMutation } from './types';
import type { AddEntryPayload } from './types';

const addPayload: AddEntryPayload = {
  date: '2026-05-01',
  tag: 'Groceries',
  description: 'test',
  direction: 'O',
  amount: 100,
};

function makeStore() {
  return {
    addEntry: vi.fn(),
    updateEntry: vi.fn(),
  };
}

describe('applyMutation', () => {
  it('add (single payload) → calls store.addEntry with the payload', () => {
    const store = makeStore();
    const m: EntryMutation = { type: 'add', payload: addPayload };
    applyMutation(store, m);
    expect(store.addEntry).toHaveBeenCalledWith(addPayload);
    expect(store.updateEntry).not.toHaveBeenCalled();
  });

  it('add (array payload) → calls store.addEntry with the array', () => {
    const store = makeStore();
    const arr = [addPayload, { ...addPayload, tag: 'Dining', amount: 200 }];
    const m: EntryMutation = { type: 'add', payload: arr };
    applyMutation(store, m);
    expect(store.addEntry).toHaveBeenCalledWith(arr);
    expect(store.updateEntry).not.toHaveBeenCalled();
  });

  it('edit → calls store.updateEntry with id and patch', () => {
    const store = makeStore();
    const m: EntryMutation = { type: 'edit', id: 7, patch: { amount: 999 } };
    applyMutation(store, m);
    expect(store.updateEntry).toHaveBeenCalledWith(7, { amount: 999 });
    expect(store.addEntry).not.toHaveBeenCalled();
  });
});
