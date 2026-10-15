import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import RedistributeSheet from './RedistributeSheet.svelte';
import type { CategoryMap, AddEntryPayload, EntrySubmission } from '../../lib/types';

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
    onsubmit: vi.fn(() => ({ accepted: true, completion: Promise.resolve(true) })),
    ...overrides,
  };
}

it('opens as a dialog labeled Redistribute Funds', () => {
  const { getByRole } = render(RedistributeSheet, baseProps());
  expect(getByRole('dialog', { name: 'Redistribute Funds' })).toBeVisible();
});

it('resets selections, amount, validation and admission errors when reopened', async () => {
  const view = render(RedistributeSheet, baseProps({
    onsubmit: () => ({ accepted: false, error: 'Storage is full', completion: Promise.resolve(false) }),
  }));
  await fireEvent.click(view.getAllByRole('button', { name: /^HOUSING$/ })[0]);
  await fireEvent.click(view.getAllByRole('button', { name: /^FINANCE$/ })[1]);
  await fireEvent.input(view.getByPlaceholderText('0.00'), { target: { value: '100' } });
  await fireEvent.click(view.getByRole('button', { name: /^Redistribute$/ }));
  expect(view.getByRole('alert')).toHaveTextContent('Storage is full');
  await fireEvent.input(view.getByPlaceholderText('0.00'), { target: { value: '-5' } });
  await fireEvent.blur(view.getByPlaceholderText('0.00'));
  expect(view.getByText('Amount must be positive')).toBeVisible();
  await view.rerender({ open: false });
  await waitFor(() => expect(view.queryByRole('dialog')).not.toBeInTheDocument());
  await view.rerender({ open: true });
  expect(view.getByRole('dialog', { name: 'Redistribute Funds' })).toBeVisible();
  expect(view.getByPlaceholderText('0.00')).toHaveValue('');
  expect(view.queryByRole('alert')).not.toBeInTheDocument();
  expect(view.queryByText('Amount must be positive')).not.toBeInTheDocument();
  expect(view.queryAllByRole('button', { pressed: true })).toHaveLength(0);
  expect(view.getByRole('button', { name: /^Redistribute$/ })).toBeDisabled();
});

it('retains the redistribution draft after refused admission and permits retry', async () => {
  const onclose = vi.fn();
  const onsubmit = vi.fn<(_legs: AddEntryPayload[]) => EntrySubmission>(() => ({ accepted: false, error: 'Storage is full', completion: Promise.resolve(false) }));
  const { getAllByRole, getByPlaceholderText, getByRole, getByText } = render(RedistributeSheet, baseProps({ onsubmit, onclose }));
  await fireEvent.click(getAllByRole('button', { name: /^HOUSING$/ })[0]);
  await fireEvent.click(getAllByRole('button', { name: /^FINANCE$/ })[1]);
  const amount = getByPlaceholderText('0.00');
  await fireEvent.input(amount, { target: { value: '100' } });
  await fireEvent.click(getByRole('button', { name: /^Redistribute$/ }));
  expect(onclose).not.toHaveBeenCalled();
  expect(amount).toHaveValue('100');
  expect(getByText('Storage is full')).toBeVisible();
  onsubmit.mockReturnValueOnce({ accepted: true, completion: new Promise<boolean>(() => {}) });
  await fireEvent.click(getByRole('button', { name: /^Redistribute$/ }));
  expect(onsubmit).toHaveBeenCalledTimes(2);
  expect(onsubmit.mock.calls[1][0]).toEqual(onsubmit.mock.calls[0][0]);
  expect(onclose).toHaveBeenCalledOnce();
});

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
  it.each([
    ['100-30', 70], ['=SUM(10,5)', 15], ['1.239+0', 1.24], ['1.234', 1.234],
  ])('submits %s identically before and after blur, retaining a refused draft', async (raw, expected) => {
    const onclose = vi.fn();
    const onsubmit = vi.fn((_legs: AddEntryPayload[]) => ({ accepted: false, completion: Promise.resolve(false) }));
    const { getAllByRole, getByPlaceholderText, getByRole } = render(RedistributeSheet, baseProps({ onsubmit, onclose }));
    await fireEvent.click(getAllByRole('button', { name: /^HOUSING$/ })[0]);
    await fireEvent.click(getAllByRole('button', { name: /^FINANCE$/ })[1]);
    const input = getByPlaceholderText('0.00');
    await fireEvent.input(input, { target: { value: raw } });
    await fireEvent.click(getByRole('button', { name: /^Redistribute$/ }));
    expect(input).toHaveValue(raw);
    expect(onclose).not.toHaveBeenCalled();
    await fireEvent.blur(input);
    await fireEvent.click(getByRole('button', { name: /^Redistribute$/ }));
    expect(onsubmit).toHaveBeenCalledTimes(2);
    for (const [legs] of onsubmit.mock.calls) {
      expect(legs).toMatchObject([
        { tag: 'HOUSING', direction: 'I', amount: -expected },
        { tag: 'FINANCE', direction: 'I', amount: expected },
      ]);
    }
  });

  it('calls onsubmit with two legs: negative drain + positive credit', async () => {
    const onsubmit = vi.fn((_legs: AddEntryPayload[]) => ({ accepted: true, completion: Promise.resolve(true) }));
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
    const [legs] = onsubmit.mock.calls[0] as [AddEntryPayload[]];
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

// --- Regression pin: unlike entryAmount, redistributionAmount must stay strict.
// A zero or negative "Amount to move" is meaningless (ADR-0005) and must keep the
// submit button disabled -- even before blur resolves the field, since a user can
// click Redistribute without ever blurring the amount input.

describe('RedistributeSheet — non-positive amount stays disabled (ADR-0005)', () => {
  it.each(['=SUM(10,)', '100-', '5*3', '0.001+0', '1-1'])('never submits invalid or rounded-zero input %s', async (raw) => {
    const onsubmit = vi.fn();
    const view = render(RedistributeSheet, baseProps({ onsubmit }));
    await fireEvent.click(view.getAllByRole('button', { name: /^HOUSING$/ })[0]);
    await fireEvent.click(view.getAllByRole('button', { name: /^FINANCE$/ })[1]);
    const input = view.getByPlaceholderText('0.00');
    await fireEvent.input(input, { target: { value: raw } });
    const submit = view.getByRole('button', { name: /^Redistribute$/ });
    expect(submit).toBeDisabled();
    await fireEvent.click(submit);
    await fireEvent.blur(input);
    expect(submit).toBeDisabled();
    await fireEvent.click(submit);
    expect(onsubmit).not.toHaveBeenCalled();
  });
  it('submit stays disabled for a zero amount, before and after blur', async () => {
    const { getAllByRole, getByPlaceholderText, getByRole } = render(RedistributeSheet, baseProps());
    const housingBtns = getAllByRole('button', { name: /^HOUSING$/ });
    const financeBtns = getAllByRole('button', { name: /^FINANCE$/ });
    await fireEvent.click(housingBtns[0]);
    await fireEvent.click(financeBtns[1]);
    const input = getByPlaceholderText('0.00') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: '0' } });
    expect(getByRole('button', { name: /^Redistribute$/ })).toBeDisabled();
    await fireEvent.blur(input);
    expect(getByRole('button', { name: /^Redistribute$/ })).toBeDisabled();
  });

  it('submit stays disabled for a negative amount, before and after blur, and blur shows the positivity error', async () => {
    const { getAllByRole, getByPlaceholderText, getByRole, getByText } = render(RedistributeSheet, baseProps());
    const housingBtns = getAllByRole('button', { name: /^HOUSING$/ });
    const financeBtns = getAllByRole('button', { name: /^FINANCE$/ });
    await fireEvent.click(housingBtns[0]);
    await fireEvent.click(financeBtns[1]);
    const input = getByPlaceholderText('0.00') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: '-5' } });
    expect(getByRole('button', { name: /^Redistribute$/ })).toBeDisabled();
    await fireEvent.blur(input);
    expect(getByRole('button', { name: /^Redistribute$/ })).toBeDisabled();
    expect(getByText('Amount must be positive')).toBeInTheDocument();
  });
});
