import { isValidTag } from './domain';
import { isFormula, evaluateFormula } from './formula';
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
  let tag         = $state('');
  let description = $state('');
  let amount      = $state('');
  let amountError = $state('');
  let splitMode   = $state(false);
  let split       = $state<SplitState>(initSplitState());
  let isEditing   = $state(false);

  const saveDisabled = $derived(
    splitMode
      ? !isSplitValid(split)
      : (!tag || !amount || !!amountError || /[=+\-]/.test(amount) || !isValidTag(tag, direction, getCategories()))
  );

  const title = $derived(
    (isEditing ? 'Edit' : 'New') + (direction === 'I' ? ' Incoming' : ' Outgoing')
  );

  function reset(entry?: Entry | null, defaultDirection: Direction = 'O'): void {
    isEditing   = entry != null;
    date        = entry?.date ?? today;
    direction   = entry?.direction ?? defaultDirection;
    tag         = entry?.tag ?? '';
    description = entry?.description ?? '';
    amount      = entry != null ? String(entry.amount) : '';
    amountError = '';
    splitMode   = false;
    split       = initSplitState();
  }

  function buildMutation(entryId?: number): EntryMutation {
    if (splitMode) {
      return { type: 'add', payload: toAddEntryPayloads(split, { date, description, direction }) };
    }
    const amt = parseFloat(amount) || 0;
    const payload: AddEntryPayload = { date, tag, description, direction, amount: amt };
    if (entryId != null) {
      return { type: 'edit', id: entryId, patch: payload };
    }
    return { type: 'add', payload };
  }

  function evaluateAmount(): void {
    if (!isFormula(amount) && !/[+\-]/.test(amount)) { amountError = ''; return; }
    const raw = isFormula(amount) ? amount : `=${amount}`;
    const result = evaluateFormula(raw);
    if ('error' in result) {
      amountError = 'Invalid formula';
    } else if (result.value <= 0) {
      amountError = 'Amount must be positive';
    } else {
      amount = result.value.toFixed(2);
      amountError = '';
    }
  }

  function sanitizeAmountInput(v: string): void {
    amount = v.startsWith('=') ? v : v.replace(/[^0-9.+\-]/g, '');
  }

  function setDirection(d: Direction): void {
    if (direction !== d) {
      direction = d;
      tag = '';
      splitMode = false;
      split = initSplitState();
    }
  }

  function toggleSplit(): void {
    splitMode = !splitMode;
    if (!splitMode) {
      tag    = '';
      amount = '';
      split  = initSplitState();
    }
  }

  return {
    get date()        { return date; },
    set date(v: string) { date = v; },
    get direction()   { return direction; },
    get tag()         { return tag; },
    set tag(v: string) { tag = v; },
    get description() { return description; },
    set description(v: string) { description = v; },
    get amount()      { return amount; },
    get amountError() { return amountError; },
    get splitMode()   { return splitMode; },
    get split()       { return split; },
    set split(v: SplitState) { split = v; },
    get saveDisabled() { return saveDisabled; },
    get title()       { return title; },
    reset,
    buildMutation,
    evaluateAmount,
    sanitizeAmountInput,
    setDirection,
    toggleSplit,
    addLeg:    () => { split = addLeg(split); },
    removeLeg: (i: number) => { split = removeLeg(split, i); },
    updateLeg: (i: number, patch: Parameters<typeof updateLeg>[2]) => { split = updateLeg(split, i, patch); },
  };
}
