import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import Money from './Money.svelte';

describe('Money', () => {
  // --- Cycle 1: + prefix ---

  it('prepends + to incoming (positive) amounts', () => {
    const { getByText } = render(Money, { value: 1200, positive: true });
    expect(getByText('+₱1,200.00')).toBeInTheDocument();
  });

  it('does not prepend + to outgoing (non-positive) amounts', () => {
    const { getByText } = render(Money, { value: 1200 });
    expect(getByText('₱1,200.00')).toBeInTheDocument();
  });

  // --- Cycle 2: font-weight bump ---

  it('incoming amount renders 100 heavier than the requested weight', () => {
    const { getByText } = render(Money, { value: 1200, positive: true, weight: 500 });
    const el = getByText('+₱1,200.00');
    expect(el.getAttribute('style')).toMatch(/font-weight:\s*600/);
  });

  it('outgoing amount renders at the exact requested weight', () => {
    const { getByText } = render(Money, { value: 1200, weight: 500 });
    const el = getByText('₱1,200.00');
    expect(el.getAttribute('style')).toMatch(/font-weight:\s*500/);
  });
});
