import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import EntryRow from './EntryRow.svelte';
import type { Entry } from '../../lib/types';
import type { SplitPosition } from '../../lib/groupEntries';

const SOLO_POS: SplitPosition = { inGroup: false, isFirst: true, isLast: true };

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 1,
    date: '2026-05-01',
    tag: 'FOOD',
    mainCategory: 'FOOD',
    description: 'test',
    direction: 'I',
    amount: 1000,
    ...overrides,
  };
}

// --- Cycle 1: negative-amount Incoming renders as plain negative ---

describe('EntryRow — negative Incoming entry', () => {
  it('renders without + prefix', () => {
    const { container } = render(EntryRow, {
      entry: makeEntry({ amount: -1000 }),
      splitPos: SOLO_POS,
    });
    expect(container.textContent).not.toMatch(/\+/);
  });

  it('renders the negative amount correctly', () => {
    const { getByText } = render(EntryRow, {
      entry: makeEntry({ amount: -1000 }),
      splitPos: SOLO_POS,
    });
    expect(getByText('-₱1,000.00')).toBeInTheDocument();
  });

  it('Money span does not use --positive color for a negative Incoming entry', () => {
    const { container } = render(EntryRow, {
      entry: makeEntry({ amount: -1000 }),
      splitPos: SOLO_POS,
    });
    const span = container.querySelector('span[style*="font-family"]');
    expect(span?.getAttribute('style')).not.toMatch(/--positive/);
  });
});

// --- Cycle 2: positive-amount Incoming still renders with + ---

describe('EntryRow — positive Incoming entry', () => {
  it('renders with + prefix', () => {
    const { getByText } = render(EntryRow, {
      entry: makeEntry({ amount: 1500 }),
      splitPos: SOLO_POS,
    });
    expect(getByText('+₱1,500.00')).toBeInTheDocument();
  });

  it('Money span uses --positive color', () => {
    const { container } = render(EntryRow, {
      entry: makeEntry({ amount: 1500 }),
      splitPos: SOLO_POS,
    });
    const span = container.querySelector('span[style*="font-family"]');
    expect(span?.getAttribute('style')).toMatch(/--positive/);
  });
});
