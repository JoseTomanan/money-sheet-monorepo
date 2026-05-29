import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import type { Entry } from "../lib/types";
import EntriesView from "./EntriesView.svelte";

const mockStore = vi.hoisted(() => ({
  loading: false,
  entries: [] as Entry[],
  categories: {} as Record<string, unknown>,
  pendingIds: new Set<number>(),
  masterLoading: false,
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

function getWeekTrigger(container: HTMLElement) {
  return container.querySelector("[data-week-trigger]") as HTMLElement;
}

describe("EntriesView week selector", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24")); // Sunday → week key "2026-05-24"
  });
  afterEach(() => vi.useRealTimers());

  it("trigger shows the current-week label by default", () => {
    mockStore.entries = [];
    const { container } = render(EntriesView, baseProps());
    expect(getWeekTrigger(container)).toHaveTextContent(/may 24/i);
  });

  it("opening the popover lists current week and entry week", async () => {
    mockStore.entries = [makeEntry(1, "2026-05-04")]; // week of 2026-05-03
    const { container } = render(EntriesView, baseProps());
    await fireEvent.click(getWeekTrigger(container));
    expect(document.body.querySelector("[data-week-key='2026-05-24']")).toBeInTheDocument();
    expect(document.body.querySelector("[data-week-key='2026-05-03']")).toBeInTheDocument();
  });

  it("always includes the current week even with no entries", async () => {
    mockStore.entries = [makeEntry(1, "2026-05-04")]; // week of 2026-05-03
    const { container } = render(EntriesView, baseProps());
    await fireEvent.click(getWeekTrigger(container));
    const keys = [...document.body.querySelectorAll("[data-week-row]")].map(r => r.getAttribute("data-week-key"));
    expect(keys).toContain("2026-05-24");
    expect(keys).toContain("2026-05-03");
  });

  it("no duplicate week rows when current week has entries", async () => {
    mockStore.entries = [makeEntry(1, "2026-05-24")];
    const { container } = render(EntriesView, baseProps());
    await fireEvent.click(getWeekTrigger(container));
    const matching = [...document.body.querySelectorAll("[data-week-key='2026-05-24']")];
    expect(matching).toHaveLength(1);
  });

  it("selecting a week from the popover shows only entries from that week", async () => {
    mockStore.entries = [
      makeEntry(1, "2026-05-04"), // week of 2026-05-03
      makeEntry(2, "2026-05-11"), // week of 2026-05-10
    ];
    const { container, queryByText, getByText } = render(EntriesView, baseProps());
    // default = current week → neither entry visible
    expect(queryByText("Entry 1")).not.toBeInTheDocument();
    await fireEvent.click(getWeekTrigger(container));
    const row = document.body.querySelector("[data-week-key='2026-05-03']") as HTMLElement;
    await fireEvent.click(row);
    expect(getByText("Entry 1")).toBeInTheDocument();
    expect(queryByText("Entry 2")).not.toBeInTheDocument();
  });

  it("filterDir change with no entries in selected week falls back to current week", async () => {
    // Entry 1 is Outgoing in week May 3; Entry 2 is Incoming in current week
    mockStore.entries = [
      { ...makeEntry(1, "2026-05-04"), direction: "O" },
      { ...makeEntry(2, "2026-05-24"), direction: "I" },
    ];
    const { container, getByRole } = render(EntriesView, baseProps());

    // Select week 2026-05-03 (has Entry 1 under "all")
    await fireEvent.click(getWeekTrigger(container));
    const row = document.body.querySelector("[data-week-key='2026-05-03']") as HTMLElement;
    await fireEvent.click(row);

    // Now switch direction to "Incoming" — May 3 has no Incoming entries
    const incomingBtn = getByRole("radio", { name: /incoming/i });
    await fireEvent.click(incomingBtn);

    // Trigger should snap back to current-week label
    expect(getWeekTrigger(container)).toHaveTextContent(/may 24/i);
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

  it("places the add card immediately after the last date-group", () => {
    mockStore.entries = [makeEntry(1, "2026-05-17"), makeEntry(2, "2026-05-20")];
    const { container, getByRole } = render(EntriesView, baseProps());
    const addCard = getByRole("button", { name: /ADD ENTRY/ });
    const allDateGroups = container.querySelectorAll(".date-group");
    const lastGroup = allDateGroups[allDateGroups.length - 1];
    // add card is a sibling after the last date-group (not inside it —
    // date-group has overflow:hidden which would clip the card's border-radius)
    expect(lastGroup.nextElementSibling).toBe(addCard);
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

describe("EntriesView skeleton loading", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24"));
    mockStore.loading = true;
    mockStore.entries = [];
  });
  afterEach(() => {
    vi.useRealTimers();
    mockStore.loading = false;
  });

  it("when loading, does not render 'Loading' text", () => {
    const { queryByText } = render(EntriesView, baseProps());
    expect(queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it("when loading, renders shimmer elements", () => {
    const { container } = render(EntriesView, baseProps());
    expect(container.querySelectorAll('[class*="shimmer"]').length).toBeGreaterThan(0);
  });

  it("when not loading, renders no shimmer elements", () => {
    mockStore.loading = false;
    const { container } = render(EntriesView, baseProps());
    expect(container.querySelectorAll('[class*="shimmer"]').length).toBe(0);
  });
});
