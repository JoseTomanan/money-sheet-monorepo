import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/svelte";
import BudgetsView from "./BudgetsView.svelte";

const mockStore = vi.hoisted(() => ({
  loading: true,
  entries: [] as Array<{ id: number; date: string; direction: 'I' | 'O'; amount: number; tag: string; mainCategory: string; description: string }>,
  master: { onHand: 0, budgets: {} as Record<string, number> },
  categories: {} as Record<string, string[]>,
  masterLoading: false,
  error: null as string | null,
}));

vi.mock("../lib/store.svelte", () => ({ store: mockStore }));

describe("BudgetsView hero card — monthly stats", () => {
  beforeEach(() => {
    mockStore.loading = false;
  });

  it("renders an 'Incoming' label in the hero card", () => {
    const { getByText } = render(BudgetsView);
    expect(getByText(/Incoming/i)).toBeInTheDocument();
  });

  it("renders an 'Outgoing' label in the hero card", () => {
    const { getByText } = render(BudgetsView);
    expect(getByText(/Outgoing/i)).toBeInTheDocument();
  });
});

describe("BudgetsView actions strip", () => {
  beforeEach(() => {
    mockStore.loading = false;
  });

  it("renders a 'Redistribute' action button", () => {
    const { getByRole } = render(BudgetsView);
    expect(getByRole('button', { name: /Redistribute/i })).toBeInTheDocument();
  });
});

describe("BudgetsView skeleton loading", () => {
  beforeEach(() => {
    mockStore.loading = true;
  });

  it("when loading, does not render 'Loading' text", () => {
    const { queryByText } = render(BudgetsView);
    expect(queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it("when loading, renders shimmer elements", () => {
    const { container } = render(BudgetsView);
    expect(container.querySelectorAll('[class*="shimmer"]').length).toBeGreaterThan(0);
  });

  it("when not loading, renders no shimmer elements", () => {
    mockStore.loading = false;
    const { container } = render(BudgetsView);
    expect(container.querySelectorAll('[class*="shimmer"]').length).toBe(0);
  });
});
