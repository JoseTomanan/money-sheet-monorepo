import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/svelte";
import HomeScreen from "./HomeScreen.svelte";

const mockStore = vi.hoisted(() => ({
  loading: true,
  entries: [],
  master: { onHand: 0, budgets: {} as Record<string, number> },
  categories: {} as Record<string, string[]>,
  masterLoading: false,
  error: null as string | null,
}));

vi.mock("../lib/store.svelte", () => ({ store: mockStore }));

const baseProps = { onnavigate: vi.fn() };

describe("HomeScreen hero card content", () => {
  it("when not loading, renders the ON HAND label", () => {
    mockStore.loading = false;
    const { getByText } = render(HomeScreen, baseProps);
    expect(getByText("ON HAND")).toBeInTheDocument();
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
