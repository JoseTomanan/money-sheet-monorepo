import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import App from "./App.svelte";

const mockSetConnection = vi.hoisted(() => vi.fn());
const mockExitMockMode = vi.hoisted(() => vi.fn());
const mockConnection = vi.hoisted(() => ({
  current: { gasUrl: "https://fake.example", apiSecret: "secret" } as
    | { gasUrl: string; apiSecret: string }
    | null,
}));
const mockMockMode = vi.hoisted(() => ({ current: false }));
const mockStore = vi.hoisted(() => ({
  loading: false,
  error: null as string | null,
  errorIsConnection: false,
  entries: [] as unknown[],
  categories: {},
  master: { onHand: 0, budgets: {} },
  config: { currency: "₱" },
  stats: {
    categoryMonthChange: [] as Array<{ category: string; incoming: number; outgoing: number; netChange: number }>,
    spendingPace: [] as Array<{ day: number; cumulativeThisMonth: number; cumulativeUsual: number }>,
    windowTotals: [] as Array<{ window: "30d" | "3mo" | "12mo"; incoming: number; outgoing: number; net: number }>,
    windowCategorySpend: [] as Array<{ window: "30d" | "3mo" | "12mo"; category: string; outgoing: number }>,
  },
  pendingIds: new Set<number>(),
  deletePendingIds: new Set<number>(),
  localIds: new Set<number>(),
  draining: false,
  drainQueue: vi.fn(),
  toastMsg: null as string | null,
  toastIsConnection: false,
  toastAction: null,
  init: vi.fn(),
  refreshAll: vi.fn(),
  deleteEntry: vi.fn(),
  dismissToast: vi.fn(),
}));

vi.mock("./lib/connection.svelte", () => ({
  connection: mockConnection,
  mockMode: mockMockMode,
  setConnection: mockSetConnection,
  exitMockMode: mockExitMockMode,
}));
vi.mock("./lib/store.svelte", () => ({ store: mockStore }));

describe("App settings sheet", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/#/home");
    mockStore.loading = false;
    mockStore.error = null;
    mockStore.toastMsg = null;
    mockConnection.current = {
      gasUrl: "https://fake.example",
      apiSecret: "secret",
    };
    mockMockMode.current = false;
  });

  afterEach(() => window.history.replaceState(null, "", "/#/home"));

  it("settings sheet is hidden on initial render", () => {
    const { queryByRole } = render(App);
    expect(queryByRole("dialog")).toBeNull();
  });

  it("clicking the gear button opens the settings dialog", async () => {
    const { getByRole } = render(App);
    await fireEvent.click(getByRole("button", { name: /open settings/i }));
    expect(getByRole("dialog")).toBeInTheDocument();
  });

  it("keeps the gear button at its normal offset when Mock Mode is inactive", () => {
    const { getByRole } = render(App);
    const gear = getByRole("button", { name: /open settings/i });
    expect(gear.className).toMatch(/\btop-3\b/);
  });

  it("settings dialog contains GAS URL and API Secret inputs", async () => {
    const { getByRole, getByLabelText } = render(App);
    await fireEvent.click(getByRole("button", { name: /open settings/i }));
    expect(getByLabelText(/GAS URL/i)).toBeInTheDocument();
    expect(getByLabelText(/API Secret/i)).toBeInTheDocument();
  });

  it("settings dialog has a Settings title", async () => {
    const { getByRole } = render(App);
    await fireEvent.click(getByRole("button", { name: /open settings/i }));
    expect(getByRole("dialog")).toBeInTheDocument();
    expect(document.body.textContent).toContain("Settings");
  });
});

// ── Cycles 10–12: Mock Mode branch ────────────────────────────────────────

describe("App — Mock Mode branch", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/#/home");
    mockStore.loading = false;
    mockStore.error = null;
    mockStore.toastMsg = null;
    mockConnection.current = null;
    mockMockMode.current = true;
  });

  it("renders MockBanner with 'Mock mode' text when mockMode is active", () => {
    const { getByText } = render(App);
    expect(getByText("Mock mode")).toBeInTheDocument();
  });

  it("does not render SettingsGate when mockMode is active", () => {
    const { queryByLabelText } = render(App);
    expect(queryByLabelText(/GAS URL/i)).toBeNull();
  });

  it("clicking Exit in MockBanner calls exitMockMode", async () => {
    const { getByRole } = render(App);
    await fireEvent.click(getByRole("button", { name: /exit/i }));
    expect(mockExitMockMode).toHaveBeenCalledOnce();
  });

  it("offsets the gear button below the Mock Mode banner so it isn't occluded", () => {
    // The banner is `fixed top-0 h-8` (32px) at z-[600]; the gear button is
    // `fixed` so .app-shell's pt-8 compensation (in-flow only) doesn't reach it.
    // Uncompensated, the button sits at top-3 (12px) and its top ~20px hide
    // under the banner, making it unclickable in a real browser.
    const { getByRole } = render(App);
    const gear = getByRole("button", { name: /open settings/i });
    expect(gear.className).not.toMatch(/\btop-3\b/);
    expect(gear.className).toMatch(/\btop-11\b/);
  });
});

describe("App — SettingsGate shown when mockMode is false and no connection", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/#/home");
    mockStore.loading = false;
    mockStore.error = null;
    mockStore.toastMsg = null;
    mockConnection.current = null;
    mockMockMode.current = false;
  });

  it("renders SettingsGate (GAS URL input) when no connection and mock dismissed", () => {
    const { getByLabelText } = render(App);
    expect(getByLabelText(/GAS URL/i)).toBeInTheDocument();
  });

  it("does not render MockBanner when mockMode is false", () => {
    const { queryByText } = render(App);
    expect(queryByText("Mock mode")).toBeNull();
  });
});

// ── Deeper statistics navigation (#132) — reached from Summary, not a tab ──

describe("App — Deeper statistics navigation", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/#/home");
    mockStore.loading = false;
    mockStore.error = null;
    mockStore.toastMsg = null;
    mockConnection.current = {
      gasUrl: "https://fake.example",
      apiSecret: "secret",
    };
    mockMockMode.current = false;
  });

  it("clicking Deeper stats from Summary shows the Deeper statistics page", async () => {
    const { getByRole, getByText } = render(App);
    await fireEvent.click(getByRole("button", { name: "Summary" }));
    await fireEvent.click(getByRole("button", { name: "Deeper statistics" }));
    expect(getByText("Deeper stats")).toBeInTheDocument();
    expect(getByText("Flow")).toBeInTheDocument();
  });

  it("the Deeper page's back link returns to Summary", async () => {
    const { getByRole, queryByText, getByText } = render(App);
    await fireEvent.click(getByRole("button", { name: "Summary" }));
    await fireEvent.click(getByRole("button", { name: "Deeper statistics" }));
    await fireEvent.click(getByRole("button", { name: "Back to Summary" }));
    expect(queryByText("Flow")).toBeNull();
    expect(getByText("Funds health")).toBeInTheDocument();
  });

  it("the Summary tab routes out of deeper statistics", async () => {
    const { getByRole, queryByText } = render(App);
    await fireEvent.click(getByRole("button", { name: "Summary" }));
    await fireEvent.click(getByRole("button", { name: "Deeper statistics" }));
    await fireEvent.click(getByRole("button", { name: "Home" }));
    await fireEvent.click(getByRole("button", { name: "Summary" }));
    expect(queryByText("Flow")).toBeNull();
  });
});

describe("App — hash routes", () => {
  beforeEach(() => {
    mockStore.loading = false;
    mockStore.error = null;
    mockConnection.current = { gasUrl: "https://fake.example", apiSecret: "secret" };
    mockMockMode.current = false;
  });

  afterEach(() => window.history.replaceState(null, "", "/#/home"));

  it("renders the view in a direct Summary route", () => {
    window.history.replaceState(null, "", "/#/summary");
    const { getByText } = render(App);
    expect(getByText("Funds health")).toBeInTheDocument();
  });

  it("renders a direct valid empty Entries week route", () => {
    window.history.replaceState(null, "", "/#/entries/2025-01-05");
    const { getByText } = render(App);
    expect(getByText(/Jan 5 – 11, 2025/)).toBeInTheDocument();
    expect(window.location.hash).toBe("#/entries/2025-01-05");
  });

  it("synchronizes a browser route traversal without adding history", async () => {
    window.history.replaceState(null, "", "/#/home");
    const { getByText } = render(App);
    window.history.pushState(null, "", "/#/summary/statistics");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await Promise.resolve();
    expect(getByText("Deeper stats")).toBeInTheDocument();
  });

  it("closes Settings when deliberate navigation changes route", async () => {
    window.history.replaceState(null, "", "/#/home");
    const { getByRole, queryByRole } = render(App);
    await fireEvent.click(getByRole("button", { name: /open settings/i }));
    await fireEvent.click(getByRole("button", { name: "Summary" }));
    expect(queryByRole("dialog")).toBeNull();
  });

  it("restores the previous route's scroll position on browser traversal", async () => {
    window.history.replaceState(null, "", "/#/home");
    const { container, getByRole } = render(App);
    const scrollArea = container.querySelector(".scroll-area") as HTMLElement;
    scrollArea.scrollTop = 123;
    await fireEvent.scroll(scrollArea);

    await fireEvent.click(getByRole("button", { name: "Summary" }));
    expect(scrollArea.scrollTop).toBe(0);

    window.history.replaceState(null, "", "/#/home");
    window.dispatchEvent(new PopStateEvent("popstate"));
    await Promise.resolve();
    expect(scrollArea.scrollTop).toBe(123);
  });
});
