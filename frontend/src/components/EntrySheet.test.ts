import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/svelte";
import EntrySheet from "./EntrySheet.svelte";
import type { CategoryMap, Entry } from "../lib/types";

const CATEGORIES: CategoryMap = {
  Food: ["Dining", "Groceries"],
  Salary: [],
};

function baseProps(overrides = {}) {
  return {
    open: true,
    categories: CATEGORIES,
    onclose: vi.fn(),
    onsave: vi.fn(),
    ...overrides,
  };
}

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 1,
    date: "2026-05-01",
    tag: "Dining",
    mainCategory: "Food",
    description: "Test",
    direction: "O",
    amount: 100,
    ...overrides,
  };
}

describe("EntrySheet — saveDisabled direction/tag validation", () => {
  it("Save enabled for valid Outgoing entry with subcategory tag", async () => {
    const { getByRole } = render(
      EntrySheet,
      baseProps({ entry: makeEntry({ direction: "O", tag: "Dining" }) })
    );
    await waitFor(() =>
      expect(getByRole("button", { name: /^Save$/ })).not.toBeDisabled()
    );
  });

  it("Save enabled for valid Incoming entry with category tag", async () => {
    const { getByRole } = render(
      EntrySheet,
      baseProps({ entry: makeEntry({ direction: "I", tag: "Food", mainCategory: "Food" }) })
    );
    await waitFor(() =>
      expect(getByRole("button", { name: /^Save$/ })).not.toBeDisabled()
    );
  });

  it("Save disabled when direction=Incoming but tag is a subcategory (mismatch)", async () => {
    // This is the silent-corruption scenario from issue #50:
    // entry stored with direction='I' but a subcategory tag ('Dining')
    const { getByRole } = render(
      EntrySheet,
      baseProps({ entry: makeEntry({ direction: "I", tag: "Dining", mainCategory: "Food" }) })
    );
    await waitFor(() =>
      expect(getByRole("button", { name: /^Save$/ })).toBeDisabled()
    );
  });

  it("Save disabled when tag is empty (regression guard)", async () => {
    const { getByRole } = render(
      EntrySheet,
      baseProps({ entry: makeEntry({ direction: "O", tag: "", amount: 100 }) })
    );
    await waitFor(() =>
      expect(getByRole("button", { name: /^Save$/ })).toBeDisabled()
    );
  });
});
