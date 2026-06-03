import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import RedistributeSheet from './RedistributeSheet.svelte';
import type { CategoryMap, AddEntryPayload } from '../lib/types';

const CATEGORIES: CategoryMap = {
  HOUSING: ['Rent', 'Utilities'],
  FOOD: ['Groceries', 'Dining'],
  FINANCE: ['Savings', 'Investment'],
};

function baseProps(overrides = {}) {
  return {
    open: true,
    categories: CATEGORIES,
    onclose: vi.fn(),
    onsubmit: vi.fn(),
    ...overrides,
  };
}

// --- Cycle 1: submit disabled initially ---

describe('RedistributeSheet — initial state', () => {
  it('submit button is disabled when no source or target is chosen', () => {
    const { getByRole } = render(RedistributeSheet, baseProps());
    expect(getByRole('button', { name: /^Redistribute$/ })).toBeDisabled();
  });
});

// --- Cycle 2: same source and target keeps submit disabled ---

describe('RedistributeSheet — source === target guard', () => {
  it('submit stays disabled when source and target are the same category', async () => {
    const { getAllByRole, getByPlaceholderText, getByRole } = render(RedistributeSheet, baseProps());
    // Pick HOUSING as source
    const housingBtns = getAllByRole('button', { name: /^HOUSING$/ });
    await fireEvent.click(housingBtns[0]); // first HOUSING pill = source
    // Pick HOUSING as target (second picker)
    await fireEvent.click(housingBtns[1]);
    // Fill amount
    await fireEvent.input(getByPlaceholderText('0.00'), { target: { value: '500' } });
    expect(getByRole('button', { name: /^Redistribute$/ })).toBeDisabled();
  });
});

// --- Cycle 3: distinct source + target + amount enables submit ---

describe('RedistributeSheet — valid state', () => {
  it('submit is enabled when source ≠ target and amount > 0', async () => {
    const { getAllByRole, getByPlaceholderText, getByRole } = render(RedistributeSheet, baseProps());
    const housingBtns = getAllByRole('button', { name: /^HOUSING$/ });
    const financeBtns = getAllByRole('button', { name: /^FINANCE$/ });
    await fireEvent.click(housingBtns[0]); // source = HOUSING
    await fireEvent.click(financeBtns[1]); // target = FINANCE
    await fireEvent.input(getByPlaceholderText('0.00'), { target: { value: '1000' } });
    await waitFor(() =>
      expect(getByRole('button', { name: /^Redistribute$/ })).not.toBeDisabled()
    );
  });
});

// --- Cycle 4: on submit, onsubmit receives the correct two legs ---

describe('RedistributeSheet — submit payload', () => {
  it('calls onsubmit with two legs: negative drain + positive credit', async () => {
    const onsubmit = vi.fn();
    const { getAllByRole, getByPlaceholderText, getByRole } = render(
      RedistributeSheet,
      baseProps({ onsubmit }),
    );
    const housingBtns = getAllByRole('button', { name: /^HOUSING$/ });
    const financeBtns = getAllByRole('button', { name: /^FINANCE$/ });
    await fireEvent.click(housingBtns[0]);
    await fireEvent.click(financeBtns[1]);
    await fireEvent.input(getByPlaceholderText('0.00'), { target: { value: '1000' } });
    await waitFor(() =>
      expect(getByRole('button', { name: /^Redistribute$/ })).not.toBeDisabled()
    );
    await fireEvent.click(getByRole('button', { name: /^Redistribute$/ }));

    expect(onsubmit).toHaveBeenCalledOnce();
    const [legs]: [AddEntryPayload[]] = onsubmit.mock.calls[0];
    expect(legs).toHaveLength(2);

    const drain  = legs.find(l => l.amount < 0)!;
    const credit = legs.find(l => l.amount > 0)!;

    expect(drain.tag).toBe('HOUSING');
    expect(drain.amount).toBe(-1000);
    expect(drain.direction).toBe('I');
    expect(drain.description).toBe('[REDISTRIBUTE]');

    expect(credit.tag).toBe('FINANCE');
    expect(credit.amount).toBe(1000);
    expect(credit.direction).toBe('I');
    expect(credit.description).toBe('[REDISTRIBUTE]');
  });
});

// --- Cycle 5: formula support ---

describe('RedistributeSheet — formula amount', () => {
  it('resolves =1000+500 to 1500.00 on blur', async () => {
    const { getByPlaceholderText } = render(RedistributeSheet, baseProps());
    const input = getByPlaceholderText('0.00') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: '=1000+500' } });
    await fireEvent.blur(input);
    await waitFor(() => expect(input.value).toBe('1500.00'));
  });
});
