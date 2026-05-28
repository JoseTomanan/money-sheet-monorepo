import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/svelte";
import BudgetsView from "./BudgetsView.svelte";

const mockStore = vi.hoisted(() => ({
  loading: true,
  entries: [],
  master: { onHand: 0, budgets: {} as Record<string, number> },
  categories: {} as Record<string, string[]>,
  masterLoading: false,
  error: null as string | null,
}));

vi.mock("../lib/store.svelte", () => ({ store: mockStore }));

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
