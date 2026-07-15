import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/svelte";
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
    const { getByText } = render(SummaryView);
    for (const label of ["Housing", "Food", "Transit", "Health", "Finance", "Lifestyle", "Misc"]) {
      expect(getByText(label)).toBeInTheDocument();
    }
  });

  it("shows each category's balance from master.budgets", () => {
    const { getByText } = render(SummaryView);
    expect(getByText("₱3,000.00")).toBeInTheDocument();   // Health balance (unique)
    expect(getByText("₱8,000.00")).toBeInTheDocument();   // Finance balance (unique)
  });

  it("tints a negative-balance row with the destructive surface", () => {
    const { getByText } = render(SummaryView);
    const row = getByText("Transit").closest(".envelope-row");
    expect(row?.className).toContain("bg-[var(--destructive-tint-bg)]");
  });

  it("marks a low (but non-negative) balance with a hairline marker and Low label", () => {
    const { getByText } = render(SummaryView);
    const row = getByText("Food").closest(".envelope-row");
    expect(row?.querySelector(".low-marker")).not.toBeNull();
    expect(row?.textContent).toContain("Low");
  });

  it("shows a direction chip carrying the month's net change", () => {
    const { getByText } = render(SummaryView);
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
    const { getByText } = render(SummaryView);
    // latest populated day depends on the wall clock; either headline is valid.
    expect(getByText(/(faster|slower) than usual/)).toBeInTheDocument();
  });

  it("has a Spending pace section header", () => {
    const { getByText } = render(SummaryView);
    expect(getByText("Spending pace")).toBeInTheDocument();
  });
});

describe("SummaryView header", () => {
  beforeEach(seedHealthyStore);

  it("renders a Deeper stats link in the header", () => {
    const { getByText } = render(SummaryView, { ondeeper: vi.fn() });
    expect(getByText("Deeper stats")).toBeInTheDocument();
  });

  it("the Deeper stats link is a real, focusable button (not the disabled #130 stub)", () => {
    const { getByRole } = render(SummaryView, { ondeeper: vi.fn() });
    const btn = getByRole("button", { name: "Deeper statistics" });
    expect(btn).not.toHaveAttribute("aria-disabled");
    expect(btn.className).not.toContain("opacity-60");
  });

  it("calls ondeeper when the Deeper stats link is clicked", async () => {
    const ondeeper = vi.fn();
    const { getByRole } = render(SummaryView, { ondeeper });
    const { fireEvent } = await import("@testing-library/svelte");
    await fireEvent.click(getByRole("button", { name: "Deeper statistics" }));
    expect(ondeeper).toHaveBeenCalledOnce();
  });

  it("no longer renders the old month stepper", () => {
    const { queryByRole } = render(SummaryView);
    expect(queryByRole("button", { name: /Previous month/i })).toBeNull();
    expect(queryByRole("button", { name: /Next month/i })).toBeNull();
  });
});

describe("SummaryView actions strip (relocated to Entries by #131)", () => {
  beforeEach(seedHealthyStore);

  it("no longer renders a Redistribute action button", () => {
    const { queryByRole } = render(SummaryView);
    expect(queryByRole('button', { name: /Redistribute/i })).toBeNull();
  });

  it("no longer renders a Bulk delete action button", () => {
    const { queryByRole } = render(SummaryView);
    expect(queryByRole('button', { name: /Bulk delete/i })).toBeNull();
  });
});

describe("SummaryView desktop layout (#responsive)", () => {
  beforeEach(seedHealthyStore);

  it("wraps the envelope list and spending pace in a shared two-column grid", () => {
    const { container, getByText } = render(SummaryView);
    const cols = container.querySelector(".summary-cols");
    expect(cols).not.toBeNull();
    expect(getByText("Housing").closest(".summary-cols")).toBe(cols);
    expect(getByText("Spending pace").closest(".summary-cols")).toBe(cols);
  });

  it("keeps envelopes in the left pane and spending pace in a distinct right-hand pane", () => {
    const { getByText } = render(SummaryView);
    expect(getByText("Housing").closest(".summary-aside")).toBeNull();
    expect(getByText("Spending pace").closest(".summary-aside")).not.toBeNull();
  });

  it("declares the desktop reflow via a responsive grid class, not just structure", () => {
    const { container } = render(SummaryView);
    expect(container.querySelector(".summary-cols")?.className).toContain("md:grid");
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
    seedHealthyStore();
    const { container } = render(SummaryView);
    expect(container.querySelectorAll('[class*="shimmer"]').length).toBe(0);
  });

  it("uses the same two-column grid as the loaded state, so desktop layout doesn't shift on load", () => {
    const { container } = render(SummaryView);
    expect(container.querySelector(".summary-cols")).not.toBeNull();
  });
});
