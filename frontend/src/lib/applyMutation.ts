import type { EntryMutation, AddEntryPayload, UpdateEntryPatch } from './types';

interface MutationTarget {
  addEntry(payload: AddEntryPayload | AddEntryPayload[]): void;
  updateEntry(id: number, patch: UpdateEntryPatch): void;
}

export function applyMutation(store: MutationTarget, m: EntryMutation): void {
  switch (m.type) {
    case 'add':
      store.addEntry(m.payload);
      break;
    case 'edit':
      store.updateEntry(m.id, m.patch);
      break;
    default: {
      const _exhaustive: never = m;
      throw new Error(`Unhandled EntryMutation type: ${(_exhaustive as EntryMutation).type}`);
    }
  }
}
