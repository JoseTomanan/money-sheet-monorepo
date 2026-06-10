import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/svelte";
import SummaryView from "./SummaryView.svelte";

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

describe("SummaryView skeleton loading", () => {
  beforeEach(() => {
    mockStore.loading = true;
  });

  it("when loading, does not render 'Loading' text", () => {
    const { queryByText } = render(SummaryView);
    expect(queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it("when loading, renders skeleton elements", () => {
    const { container } = render(SummaryView);
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
  });

  it("when not loading, renders no skeleton elements", () => {
    mockStore.loading = false;
    const { container } = render(SummaryView);
    expect(container.querySelectorAll('.skeleton').length).toBe(0);
  });
});
