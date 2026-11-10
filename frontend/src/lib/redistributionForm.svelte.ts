import { redistributionAmount } from './amountField';
import { today } from './format';
import type { AddEntryPayload } from './types';

/** Fund Redistribution draft; persistence and atomic admission remain with the store. */
export function createRedistributionForm() {
  const date = today();
  let source = $state('');
  let target = $state('');
  let amount = $state('');
  const evaluatedAmount = $derived(redistributionAmount.validate(amount));
  const submitDisabled = $derived(!source || !target || source === target || 'error' in evaluatedAmount);

  function buildPayloads(): AddEntryPayload[] {
    if (submitDisabled || 'error' in evaluatedAmount) throw new Error('Invalid redistribution');
    return [
      { date, tag: source, description: '[REDISTRIBUTE]', direction: 'I', amount: -evaluatedAmount.value },
      { date, tag: target, description: '[REDISTRIBUTE]', direction: 'I', amount: evaluatedAmount.value },
    ];
  }

  return {
    get source() { return source; },
    set source(value: string) { source = value; },
    get target() { return target; },
    set target(value: string) { target = value; },
    get amount() { return amount; },
    set amount(value: string) { amount = value; },
    get submitDisabled() { return submitDisabled; },
    reset() { source = ''; target = ''; amount = ''; },
    buildPayloads,
  };
}
