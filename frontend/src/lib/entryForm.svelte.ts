import { isValidTag } from './domain';
import {
  initSplitState,
  addLeg,
  removeLeg,
  updateLeg,
  isSplitValid,
  toAddEntryPayloads,
  type SplitState,
} from './splitEntry';
import type { CategoryMap, Entry, AddEntryPayload, Direction, EntryMutation } from './types';

export function createEntryForm(getCategories: () => CategoryMap) {
  const today = new Date().toISOString().slice(0, 10);

  let date        = $state(today);
  let direction   = $state<Direction>('O');
  let description = $state('');
  let split       = $state<SplitState>(initSplitState());
  let isEditing   = $state(false);

  const saveDisabled = $derived(
    !isSplitValid(split) ||
    !split.legs.every(l => isValidTag(l.tag, direction, getCategories()))
  );

  const title = $derived(
    (isEditing ? 'Edit' : 'New') + (direction === 'I' ? ' Incoming' : ' Outgoing')
  );

  function reset(entry?: Entry | null, defaultDirection: Direction = 'O'): void {
    isEditing   = entry != null;
    date        = entry?.date ?? today;
    direction   = entry?.direction ?? defaultDirection;
    description = entry?.description ?? '';
    split       = entry != null
      ? { legs: [{ tag: entry.tag, amount: String(entry.amount) }] }
      : initSplitState();
  }

  function buildMutation(entryId?: number): EntryMutation {
    const leg = split.legs[0];
    const sharedPayload: AddEntryPayload = {
      date,
      tag: leg.tag,
      description,
      direction,
      amount: parseFloat(leg.amount) || 0,
    };

    if (entryId != null) {
      return { type: 'edit', id: entryId, patch: sharedPayload };
    }

    if (split.legs.length === 1) {
      return { type: 'add', payload: sharedPayload };
    }

    return { type: 'add', payload: toAddEntryPayloads(split, { date, description, direction }) };
  }

  function setDirection(d: Direction): void {
    if (direction !== d) {
      direction = d;
      split = initSplitState();
    }
  }

  return {
    get date()        { return date; },
    set date(v: string) { date = v; },
    get direction()   { return direction; },
    get description() { return description; },
    set description(v: string) { description = v; },
    get split()       { return split; },
    set split(v: SplitState) { split = v; },
    get saveDisabled() { return saveDisabled; },
    get title()       { return title; },
    reset,
    buildMutation,
    setDirection,
    addLeg:    () => { split = addLeg(split); },
    removeLeg: (i: number) => { split = removeLeg(split, i); },
    updateLeg: (i: number, patch: Parameters<typeof updateLeg>[2]) => { split = updateLeg(split, i, patch); },
  };
}
