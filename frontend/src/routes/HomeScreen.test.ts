import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render } from "@testing-library/svelte";
import HomeScreen from "./HomeScreen.svelte";
import type { Entry } from '../lib/types';

const mockStore = vi.hoisted(() => ({
  syncStatus: { phase: 'ready', detail: 'Up to date. Confirmed data from Sheets.', action: 'Refresh data' },
  retrySync: vi.fn(),
  loading: true,
  entries: [] as Entry[],
  localIds: new Set<number>(),
  hasSnapshot: true,
  balancesStale: false,
  master: { onHand: 0, budgets: {} as Record<string, number> },
  categories: {} as Record<string, string[]>,
  config: { currency: "₱", nickname: 'Alex' },
  masterLoading: false,
  error: null as string | null,
}));

vi.mock("../lib/store.svelte", () => ({ store: mockStore }));

const baseProps = { onnavigate: vi.fn() };

describe("Home reference", () => {
  beforeEach(() => {
    mockStore.loading = false;
    mockStore.hasSnapshot = true;
    mockStore.balancesStale = false;
    mockStore.entries = [];
    mockStore.localIds = new Set();
    mockStore.master = { onHand: 0, budgets: {} };
    mockStore.config.currency = '₱';
  });

  it('distinguishes a missing Category budget from a confirmed zero', () => {
    mockStore.master.budgets = { FOOD: 0 };
    const { getByRole } = render(HomeScreen, baseProps);
    const budgets = getByRole('region', { name: 'Category budgets' });
    expect(budgets).toHaveTextContent('₱0.00');
    expect(budgets.querySelectorAll('[aria-label="Budget unavailable"]')).toHaveLength(6);
  });

  it('keeps last-confirmed balances and identifies local latest Entries while stale', () => {
    mockStore.balancesStale = true;
    mockStore.master.onHand = 345;
    mockStore.entries = [{ id: -1, date: '2026-09-11', tag: 'Dining', mainCategory: 'FOOD', description: 'Lunch saved locally', direction: 'O', amount: 20 }];
    mockStore.localIds.add(-1);
    const { getByText, getByLabelText, getByRole } = render(HomeScreen, baseProps);
    expect(getByText('Balances awaiting sync')).toBeInTheDocument();
    expect(getByRole('region', { name: 'On hand' })).toHaveTextContent('₱345.00');
    expect(getByText('Lunch saved locally')).toBeInTheDocument();
    expect(getByLabelText('Not yet synced')).toBeInTheDocument();
  });

  it('withholds financial values before the first snapshot even after loading fails', () => {
    mockStore.hasSnapshot = false;
    const { queryByRole, container } = render(HomeScreen, baseProps);
    expect(queryByRole('region', { name: 'On hand' })).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent('₱0.00');
    expect(container.querySelector('[class*="shimmer"]')).toBeInTheDocument();
  });

  it('labels the financial sections and keeps their navigation and configured currency', async () => {
    mockStore.loading = false;
    mockStore.config.currency = '$';
    mockStore.master = { onHand: -1250, budgets: { FOOD: 42 } };
    const onnavigate = vi.fn();
    const { getByRole, getByText } = render(HomeScreen, { onnavigate });
    expect(getByText('Hi, Alex.')).toBeInTheDocument();
    expect(getByRole('region', { name: 'On hand' })).toHaveTextContent('-$1,250.00');
    expect(getByRole('region', { name: 'Category budgets' })).toHaveTextContent('$42.00');
    expect(getByRole('region', { name: 'Latest entries' })).toHaveTextContent('No entries yet.');
    await fireEvent.click(getByRole('button', { name: 'All entries' }));
    await fireEvent.click(getByRole('button', { name: 'See summary' }));
    expect(onnavigate.mock.calls).toEqual([['entries'], ['summary']]);
    mockStore.config.currency = '₱';
  });

  it("when not loading, renders the ON HAND label", () => {
    mockStore.loading = false;
    const { getByText } = render(HomeScreen, baseProps);
    expect(getByText("On hand")).toBeInTheDocument();
  });

  it("when not loading, does not render 'This Month' sub-stat", () => {
    mockStore.loading = false;
    const { queryByText } = render(HomeScreen, baseProps);
    expect(queryByText("This Month")).not.toBeInTheDocument();
  });

  it("when not loading, does not render 'All Total' sub-stat", () => {
    mockStore.loading = false;
    const { queryByText } = render(HomeScreen, baseProps);
    expect(queryByText("All Total")).not.toBeInTheDocument();
  });
});

describe("HomeScreen skeleton loading", () => {
  beforeEach(() => {
    mockStore.loading = true;
  });

  it("when loading, does not render 'Loading' text", () => {
    const { queryByText } = render(HomeScreen, baseProps);
    expect(queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it("when loading, renders shimmer elements", () => {
    const { container } = render(HomeScreen, baseProps);
    expect(container.querySelectorAll('[class*="shimmer"]').length).toBeGreaterThan(0);
  });

  it("when not loading, renders no shimmer elements", () => {
    mockStore.loading = false;
    const { container } = render(HomeScreen, baseProps);
    expect(container.querySelectorAll('[class*="shimmer"]').length).toBe(0);
  });
});
