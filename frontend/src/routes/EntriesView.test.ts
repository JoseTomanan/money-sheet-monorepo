import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import type { Entry } from "../lib/types";
import EntriesView from "./EntriesView.svelte";

const mockStore = vi.hoisted(() => ({
  entries: [] as Entry[],
  categories: {} as Record<string, unknown>,
  pendingIds: new Set<number>(),
}));

vi.mock("../lib/store.svelte", () => ({ store: mockStore }));

function makeEntry(id: number, date: string, description = `Entry ${id}`): Entry {
  return { id, date, tag: "T", mainCategory: "FOOD", description, direction: "O", amount: 100 };
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    onadd: vi.fn(),
    onopenedit: vi.fn(),
    scrollEl: null,
    scrollTop: 0,
    ...overrides,
  };
}

describe("EntriesView week selector", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24")); // Sunday → week key "2026-05-24"
  });
  afterEach(() => vi.useRealTimers());

  it("renders a <select> in the page-eyebrow", () => {
    mockStore.entries = [];
    const { container } = render(EntriesView, baseProps());
    expect(container.querySelector("select.page-eyebrow")).toBeInTheDocument();
  });

  it("defaults to the current calendar week", () => {
    mockStore.entries = [];
    const { container } = render(EntriesView, baseProps());
    const sel = container.querySelector("select") as HTMLSelectElement;
    expect(sel.value).toBe("2026-05-24");
  });

  it("always includes the current week even if it has no entries", () => {
    mockStore.entries = [makeEntry(1, "2026-05-04")]; // week of 2026-05-03
    const { container } = render(EntriesView, baseProps());
    const opts = [...container.querySelectorAll("select option")].map(o => (o as HTMLOptionElement).value);
    expect(opts).toContain("2026-05-24"); // current week
    expect(opts).toContain("2026-05-03"); // entry week
  });

  it("lists no duplicate options when current week has entries", () => {
    mockStore.entries = [makeEntry(1, "2026-05-24")]; // entry in current week
    const { container } = render(EntriesView, baseProps());
    const opts = [...container.querySelectorAll("select option")].map(o => (o as HTMLOptionElement).value);
    expect(opts.filter(v => v === "2026-05-24")).toHaveLength(1);
  });

  it("changing the week shows only entries from that week", async () => {
    mockStore.entries = [
      makeEntry(1, "2026-05-04"), // week of 2026-05-03
      makeEntry(2, "2026-05-11"), // week of 2026-05-10
    ];
    const { container, getByText, queryByText } = render(EntriesView, baseProps());
    const sel = container.querySelector("select") as HTMLSelectElement;
    // default = current week (May 24) → neither entry visible
    expect(queryByText("Entry 1")).not.toBeInTheDocument();
    await fireEvent.change(sel, { target: { value: "2026-05-03" } });
    expect(getByText("Entry 1")).toBeInTheDocument();
    expect(queryByText("Entry 2")).not.toBeInTheDocument();
  });
});

describe("EntriesView add-entry card", () => {
  // Pin to week of May 17 so test entries (May 17 & May 20) are visible
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-17")); // Sunday → week key "2026-05-17"
  });
  afterEach(() => vi.useRealTimers());

  it("renders exactly one + ADD ENTRY button when entries exist", () => {
    mockStore.entries = [makeEntry(1, "2026-05-17"), makeEntry(2, "2026-05-20")];
    const { getAllByRole } = render(EntriesView, baseProps());
    const addButtons = getAllByRole("button", { name: /ADD ENTRY/ });
    expect(addButtons).toHaveLength(1);
    expect(addButtons[0].tagName).toBe("BUTTON");
    expect(addButtons[0].classList.contains("add-entry-card")).toBe(true);
  });

  it("keeps all real entry cards (append, not replace)", () => {
    mockStore.entries = [makeEntry(1, "2026-05-17", "Alpha"), makeEntry(2, "2026-05-20", "Beta")];
    const { container, getByText } = render(EntriesView, baseProps());
    const realCards = container.querySelectorAll(".entry-card:not(.add-entry-card)");
    expect(realCards).toHaveLength(2);
    expect(getByText("Beta")).toBeInTheDocument();
  });

  it("places the add card in the last date-group", () => {
    mockStore.entries = [makeEntry(1, "2026-05-17"), makeEntry(2, "2026-05-20")];
    const { container, getByRole } = render(EntriesView, baseProps());
    const addCard = getByRole("button", { name: /ADD ENTRY/ });
    const allDateGroups = container.querySelectorAll(".date-group");
    const lastGroup = allDateGroups[allDateGroups.length - 1];
    expect(lastGroup.contains(addCard)).toBe(true);
  });

  it("calls onadd when + ADD ENTRY is clicked", async () => {
    mockStore.entries = [makeEntry(1, "2026-05-20")];
    const props = baseProps();
    const { getByRole } = render(EntriesView, props);
    await fireEvent.click(getByRole("button", { name: /ADD ENTRY/ }));
    expect(props.onadd).toHaveBeenCalledOnce();
  });

  it("shows a standalone add card and hides 'No entries found.' when empty", () => {
    mockStore.entries = [];
    const { getByRole, queryByText } = render(EntriesView, baseProps());
    expect(getByRole("button", { name: /ADD ENTRY/ })).toBeInTheDocument();
    expect(queryByText("No entries found.")).not.toBeInTheDocument();
  });

  it("calls onadd when the standalone empty-state add card is clicked", async () => {
    mockStore.entries = [];
    const props = baseProps();
    const { getByRole } = render(EntriesView, props);
    await fireEvent.click(getByRole("button", { name: /ADD ENTRY/ }));
    expect(props.onadd).toHaveBeenCalledOnce();
  });
});
