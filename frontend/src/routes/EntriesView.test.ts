import { describe, it, expect, vi } from "vitest";
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

describe("EntriesView add-entry card", () => {
  it("renders exactly one + ADD ENTRY button when entries exist", () => {
    mockStore.entries = [makeEntry(1, "2026-05-01"), makeEntry(2, "2026-05-20")];
    const { getAllByRole } = render(EntriesView, baseProps());
    const addButtons = getAllByRole("button", { name: /ADD ENTRY/ });
    expect(addButtons).toHaveLength(1);
    expect(addButtons[0].tagName).toBe("BUTTON");
    expect(addButtons[0].classList.contains("add-entry-card")).toBe(true);
  });

  it("keeps all real entry cards (append, not replace)", () => {
    mockStore.entries = [makeEntry(1, "2026-05-01", "Alpha"), makeEntry(2, "2026-05-20", "Beta")];
    const { container, getByText } = render(EntriesView, baseProps());
    const realCards = container.querySelectorAll(".entry-card:not(.add-entry-card)");
    expect(realCards).toHaveLength(2);
    expect(getByText("Beta")).toBeInTheDocument();
  });

  it("places the add card in the last date-group", () => {
    mockStore.entries = [makeEntry(1, "2026-05-01"), makeEntry(2, "2026-05-20")];
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
