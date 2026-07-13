import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/svelte";
import SummaryView from "./SummaryView.svelte";

const mockStore = vi.hoisted(() => ({
  loading: true,
  entries: [] as Array<{ id: number; date: string; direction: 'I' | 'O'; amount: number; tag: string; mainCategory: string; description: string }>,
  master: { onHand: 0, budgets: {} as Record<string, number> },
  categories: {} as Record<string, string[]>,
  config: { currency: "₱" },
  stats: {
    categoryMonthChange: [] as Array<{ category: string; incoming: number; outgoing: number; netChange: number }>,
    spendingPace: [] as Array<{ day: number; cumulativeThisMonth: number; cumulativeUsual: number }>,
  },
  masterLoading: false,
  error: null as string | null,
  addEntry: vi.fn(),
}));

vi.mock("../lib/store.svelte", () => ({ store: mockStore }));

const noop = () => {};

function seedHealthyStore() {
  mockStore.loading = false;
  mockStore.master.budgets = {
    HOUSING: 5000,
    FOOD: 200,      // below the 1000 "low" threshold → hairline low marker
    TRANSIT: -300,  // negative → destructive tint on the row
    HEALTH: 3000,
    FINANCE: 8000,
    LIFESTYLE: 1500,
    MISC: 2500,
  };
  mockStore.stats.categoryMonthChange = [
    { category: "HOUSING", incoming: 6000, outgoing: 1000, netChange: 5000 },
    { category: "TRANSIT", incoming: 0, outgoing: 300, netChange: -300 },
  ];
  mockStore.stats.spendingPace = [
    { day: 1, cumulativeThisMonth: 100, cumulativeUsual: 50 },
    { day: 2, cumulativeThisMonth: 236, cumulativeUsual: 200 },
  ];
}

describe("SummaryView envelope rows", () => {
  beforeEach(seedHealthyStore);

  it("renders one row per category label", () => {
    const { getByText } = render(SummaryView, { props: { onbulkdelete: noop } });
    for (const label of ["Housing", "Food", "Transit", "Health", "Finance", "Lifestyle", "Misc"]) {
      expect(getByText(label)).toBeInTheDocument();
    }
  });

  it("shows each category's balance from master.budgets", () => {
    const { getByText } = render(SummaryView, { props: { onbulkdelete: noop } });
    expect(getByText("₱3,000.00")).toBeInTheDocument();   // Health balance (unique)
    expect(getByText("₱8,000.00")).toBeInTheDocument();   // Finance balance (unique)
  });

  it("tints a negative-balance row with the destructive surface", () => {
    const { getByText } = render(SummaryView, { props: { onbulkdelete: noop } });
    const row = getByText("Transit").closest(".envelope-row");
    expect(row?.className).toContain("bg-[var(--destructive-tint-bg)]");
  });

  it("marks a low (but non-negative) balance with a hairline marker and Low label", () => {
    const { getByText } = render(SummaryView, { props: { onbulkdelete: noop } });
    const row = getByText("Food").closest(".envelope-row");
    expect(row?.querySelector(".low-marker")).not.toBeNull();
    expect(row?.textContent).toContain("Low");
  });

  it("shows a direction chip carrying the month's net change", () => {
    const { getByText } = render(SummaryView, { props: { onbulkdelete: noop } });
    const housingRow = getByText("Housing").closest(".envelope-row");
    // positive net change → up chevron + the delta amount
    expect(housingRow?.textContent).toContain("▲");
    expect(housingRow?.textContent).toContain("₱5,000.00");
    const transitRow = getByText("Transit").closest(".envelope-row");
    expect(transitRow?.textContent).toContain("▼");
  });
});

describe("SummaryView spending pace", () => {
  beforeEach(seedHealthyStore);

  it("renders a faster/slower-than-usual headline from stats", () => {
    const { getByText } = render(SummaryView, { props: { onbulkdelete: noop } });
    // latest populated day depends on the wall clock; either headline is valid.
    expect(getByText(/(faster|slower) than usual/)).toBeInTheDocument();
  });

  it("has a Spending pace section header", () => {
    const { getByText } = render(SummaryView, { props: { onbulkdelete: noop } });
    expect(getByText("Spending pace")).toBeInTheDocument();
  });
});

describe("SummaryView header", () => {
  beforeEach(seedHealthyStore);

  it("renders a Deeper stats link in the header", () => {
    const { getByText } = render(SummaryView, { props: { onbulkdelete: noop } });
    expect(getByText("Deeper stats")).toBeInTheDocument();
  });

  it("no longer renders the old month stepper", () => {
    const { queryByRole } = render(SummaryView, { props: { onbulkdelete: noop } });
    expect(queryByRole("button", { name: /Previous month/i })).toBeNull();
    expect(queryByRole("button", { name: /Next month/i })).toBeNull();
  });
});

describe("SummaryView actions strip (kept until #131)", () => {
  beforeEach(seedHealthyStore);

  it("renders a Redistribute action button", () => {
    const { getByRole } = render(SummaryView, { props: { onbulkdelete: noop } });
    expect(getByRole('button', { name: /Redistribute/i })).toBeInTheDocument();
  });

  it("clicking Redistribute opens the bottom sheet", async () => {
    const { getByRole, findByText } = render(SummaryView, { props: { onbulkdelete: noop } });
    await fireEvent.click(getByRole('button', { name: /Redistribute/i }));
    await waitFor(() => findByText('Redistribute Funds'));
  });

  it("Bulk delete invokes the onbulkdelete prop", async () => {
    const onbulkdelete = vi.fn();
    const { getByRole } = render(SummaryView, { props: { onbulkdelete } });
    await fireEvent.click(getByRole('button', { name: /Bulk delete/i }));
    expect(onbulkdelete).toHaveBeenCalledOnce();
  });
});

describe("SummaryView skeleton loading", () => {
  beforeEach(() => {
    mockStore.loading = true;
  });

  it("when loading, does not render 'Loading' text", () => {
    const { queryByText } = render(SummaryView, { props: { onbulkdelete: noop } });
    expect(queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it("when loading, renders shimmer elements", () => {
    const { container } = render(SummaryView, { props: { onbulkdelete: noop } });
    expect(container.querySelectorAll('[class*="shimmer"]').length).toBeGreaterThan(0);
  });

  it("when not loading, renders no shimmer elements", () => {
    seedHealthyStore();
    const { container } = render(SummaryView, { props: { onbulkdelete: noop } });
    expect(container.querySelectorAll('[class*="shimmer"]').length).toBe(0);
  });
});
