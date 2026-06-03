import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import App from "./App.svelte";

const mockSetConnection = vi.hoisted(() => vi.fn());
const mockConnection = vi.hoisted(() => ({
  current: { gasUrl: "https://fake.example", apiSecret: "secret" } as
    | { gasUrl: string; apiSecret: string }
    | null,
}));
const mockStore = vi.hoisted(() => ({
  loading: false,
  error: null as string | null,
  errorIsConnection: false,
  entries: [] as unknown[],
  categories: {},
  master: { onHand: 0, budgets: {} },
  config: { currency: "₱" },
  pendingIds: new Set<number>(),
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
  setConnection: mockSetConnection,
}));
vi.mock("./lib/store.svelte", () => ({ store: mockStore }));

describe("App settings sheet", () => {
  beforeEach(() => {
    mockStore.loading = false;
    mockStore.error = null;
    mockStore.toastMsg = null;
    mockConnection.current = {
      gasUrl: "https://fake.example",
      apiSecret: "secret",
    };
  });

  it("settings sheet is hidden on initial render", () => {
    const { queryByRole } = render(App);
    expect(queryByRole("dialog")).toBeNull();
  });

  it("clicking the gear button opens the settings dialog", async () => {
    const { getByRole } = render(App);
    await fireEvent.click(getByRole("button", { name: /open settings/i }));
    expect(getByRole("dialog")).toBeInTheDocument();
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
