import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/svelte";
import SummaryView from "./SummaryView.svelte";
import { currentYearMonth, shiftYearMonth, monthLabel } from "../lib/format";

const mockStore = vi.hoisted(() => ({
  loading: true,
  entries: [] as Array<{ id: number; date: string; direction: 'I' | 'O'; amount: number; tag: string; mainCategory: string; description: string }>,
  master: { onHand: 0, budgets: {} as Record<string, number> },
  categories: {} as Record<string, string[]>,
  config: { currency: "₱" },
  masterLoading: false,
  error: null as string | null,
}));

vi.mock("../lib/store.svelte", () => ({ store: mockStore }));

describe("SummaryView hero card — monthly stats", () => {
  beforeEach(() => {
    mockStore.loading = false;
  });

  it("renders an 'Incoming' label in the hero card", () => {
    const { getByText } = render(SummaryView);
    expect(getByText(/Incoming/i)).toBeInTheDocument();
  });

  it("renders an 'Outgoing' label in the hero card", () => {
    const { getByText } = render(SummaryView);
    expect(getByText(/Outgoing/i)).toBeInTheDocument();
  });
});

describe("SummaryView actions strip", () => {
  beforeEach(() => {
    mockStore.loading = false;
  });

  it("renders a 'Redistribute' action button", () => {
    const { getByRole } = render(SummaryView);
    expect(getByRole('button', { name: /Redistribute/i })).toBeInTheDocument();
  });
});

describe("SummaryView — Redistribute chip opens sheet", () => {
  beforeEach(() => {
    mockStore.loading = false;
  });

  it("clicking Redistribute opens the bottom sheet (shows 'Redistribute Funds' title)", async () => {
    const { getByRole, findByText } = render(SummaryView);
    await fireEvent.click(getByRole('button', { name: /Redistribute/i }));
    await waitFor(() => findByText('Redistribute Funds'));
  });
});

describe("SummaryView month navigation", () => {
  const thisYm = currentYearMonth();
  const prevYm = shiftYearMonth(thisYm, -1);

  beforeEach(() => {
    mockStore.loading = false;
    mockStore.entries = [];
  });

  it("shows the current month in the header eyebrow", () => {
    const { getByText } = render(SummaryView, { props: { onbulkdelete: () => {} } });
    expect(getByText(monthLabel(thisYm).toUpperCase())).toBeInTheDocument();
  });

  it("disables the Next month stepper at the current month", () => {
    const { getByRole } = render(SummaryView, { props: { onbulkdelete: () => {} } });
    expect(getByRole('button', { name: /Next month/i })).toBeDisabled();
    expect(getByRole('button', { name: /Previous month/i })).not.toBeDisabled();
  });

  it("Previous month steps the header back a month and re-enables Next", async () => {
    const { getByRole, getByText } = render(SummaryView, { props: { onbulkdelete: () => {} } });
    await fireEvent.click(getByRole('button', { name: /Previous month/i }));
    expect(getByText(monthLabel(prevYm).toUpperCase())).toBeInTheDocument();
    expect(getByRole('button', { name: /Next month/i })).not.toBeDisabled();
  });

  it("tapping a Flow chart month re-scopes the view to that month", async () => {
    const { getByRole, getByText } = render(SummaryView, { props: { onbulkdelete: () => {} } });
    await fireEvent.click(getByRole('button', { name: `Select ${monthLabel(prevYm)}` }));
    expect(getByText(monthLabel(prevYm).toUpperCase())).toBeInTheDocument();
  });
});

describe("SummaryView where-it-went breakdown", () => {
  const thisYm = currentYearMonth();
  const prevYm = shiftYearMonth(thisYm, -1);

  beforeEach(() => {
    mockStore.loading = false;
    mockStore.entries = [
      { id: 1, date: `${thisYm}-05`, direction: 'O', amount: 100, tag: 'Groceries', mainCategory: 'FOOD', description: '' },
      { id: 2, date: `${prevYm}-10`, direction: 'O', amount: 500, tag: 'Rent', mainCategory: 'HOUSING', description: '' },
    ];
  });

  it("computes category share from the selected month only", () => {
    const { getByText } = render(SummaryView, { props: { onbulkdelete: () => {} } });
    // Food is 100% of this month's spend; last month's Housing entry is excluded
    expect(getByText('100.0%')).toBeInTheDocument();
  });

  it("re-scopes shares when stepping to the previous month", async () => {
    const { getByRole, getAllByText } = render(SummaryView, { props: { onbulkdelete: () => {} } });
    await fireEvent.click(getByRole('button', { name: /Previous month/i }));
    // Housing is now 100%; Food drops to 0%
    expect(getAllByText('100.0%')).toHaveLength(1);
  });

  it("shows an empty-month note when the selected month has no spending", async () => {
    mockStore.entries = [];
    const { getByText } = render(SummaryView, { props: { onbulkdelete: () => {} } });
    expect(getByText(`No spending in ${monthLabel(thisYm)}.`)).toBeInTheDocument();
  });
});

describe("SummaryView skeleton loading", () => {
  beforeEach(() => {
    mockStore.loading = true;
  });

  it("when loading, does not render 'Loading' text", () => {
    const { queryByText } = render(SummaryView);
    expect(queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it("when loading, renders shimmer elements", () => {
    const { container } = render(SummaryView);
    expect(container.querySelectorAll('[class*="shimmer"]').length).toBeGreaterThan(0);
  });

  it("when not loading, renders no shimmer elements", () => {
    mockStore.loading = false;
    const { container } = render(SummaryView);
    expect(container.querySelectorAll('[class*="shimmer"]').length).toBe(0);
  });
});
