import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import DeeperStatsView from "./DeeperStatsView.svelte";

const mockStore = vi.hoisted(() => ({
  config: { currency: "₱" },
  stats: {
    categoryMonthChange: [] as Array<{ category: string; incoming: number; outgoing: number; netChange: number }>,
    spendingPace: [] as Array<{ day: number; cumulativeThisMonth: number; cumulativeUsual: number }>,
    windowTotals: [] as Array<{ window: "30d" | "3mo" | "12mo"; incoming: number; outgoing: number; net: number }>,
    windowCategorySpend: [] as Array<{ window: "30d" | "3mo" | "12mo"; category: string; outgoing: number }>,
  },
}));

vi.mock("../lib/store.svelte", () => ({ store: mockStore }));

function seedStore() {
  mockStore.stats.windowTotals = [
    { window: "30d", incoming: 5000, outgoing: 3200, net: 1800 },
    { window: "3mo", incoming: 15000, outgoing: 16500, net: -1500 },
    { window: "12mo", incoming: 60000, outgoing: 52000, net: 8000 },
  ];
  mockStore.stats.windowCategorySpend = [
    { window: "30d", category: "FOOD", outgoing: 2000 },
    { window: "30d", category: "TRANSIT", outgoing: 1200 },
    { window: "3mo", category: "FOOD", outgoing: 9000 },
    { window: "3mo", category: "TRANSIT", outgoing: 7500 },
    { window: "12mo", category: "FOOD", outgoing: 30000 },
    { window: "12mo", category: "TRANSIT", outgoing: 22000 },
  ];
}

describe("DeeperStatsView", () => {
  beforeEach(seedStore);

  it("defaults to the 30-day window and renders its Flow totals", () => {
    const { getByText } = render(DeeperStatsView, { onback: vi.fn() });
    expect(getByText("₱5,000.00")).toBeInTheDocument(); // 30d incoming
    expect(getByText("₱3,200.00")).toBeInTheDocument(); // 30d outgoing
  });

  it("shows a grew verdict when net is positive for the selected window", () => {
    const { getByText } = render(DeeperStatsView, { onback: vi.fn() });
    expect(getByText("Grew")).toBeInTheDocument();
  });

  it("renders the Where-it-went category rows for the selected window", () => {
    const { getByText } = render(DeeperStatsView, { onback: vi.fn() });
    expect(getByText("Food")).toBeInTheDocument();
    expect(getByText("Transit")).toBeInTheDocument();
    expect(getByText("₱2,000.00")).toBeInTheDocument();
  });

  it("switching to the 3-month window updates Flow, verdict, and Where it went", async () => {
    const { getByRole, getByText } = render(DeeperStatsView, { onback: vi.fn() });
    await fireEvent.click(getByRole("radio", { name: "3 months" }));
    expect(getByText("₱15,000.00")).toBeInTheDocument(); // 3mo incoming
    expect(getByText("₱16,500.00")).toBeInTheDocument(); // 3mo outgoing
    expect(getByText("Shrank")).toBeInTheDocument(); // net is negative for 3mo
    expect(getByText("₱9,000.00")).toBeInTheDocument(); // 3mo FOOD outgoing
  });

  it("switching to the 12-month window updates the totals again", async () => {
    const { getByRole, getByText } = render(DeeperStatsView, { onback: vi.fn() });
    await fireEvent.click(getByRole("radio", { name: "12 months" }));
    expect(getByText("₱60,000.00")).toBeInTheDocument();
    expect(getByText("₱52,000.00")).toBeInTheDocument();
  });

  it("calls onback when the Summary back link is clicked", async () => {
    const onback = vi.fn();
    const { getByRole } = render(DeeperStatsView, { onback });
    await fireEvent.click(getByRole("button", { name: "Back to Summary" }));
    expect(onback).toHaveBeenCalledOnce();
  });

  it("renders no client-computed data when the sheet returns empty tables", () => {
    mockStore.stats.windowTotals = [];
    mockStore.stats.windowCategorySpend = [];
    const { getByText, getAllByText } = render(DeeperStatsView, { onback: vi.fn() });
    // Falls back to zeroed totals rather than aggregating raw entries.
    expect(getAllByText("₱0.00").length).toBeGreaterThan(0);
    expect(getByText("No spending in this window.")).toBeInTheDocument();
  });
});
