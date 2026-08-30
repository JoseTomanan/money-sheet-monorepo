import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { flushSync } from "svelte";
import { currentWeekKey, createEntriesFilter } from "./entriesFilter.svelte";
import { createEntryForm } from "./entryForm.svelte";
import { weekStartOf } from "./groupEntries";
import { today } from "./format";
import type { CategoryMap, Entry } from "./types";

const CATEGORIES: CategoryMap = { FOOD: ["Groceries", "Dining"] };

function entry(id: number, date: string, overrides: Partial<Entry> = {}): Entry {
  return { id, date, tag: "T", mainCategory: "FOOD", description: "", direction: "O", amount: 1, ...overrides };
}

function renderFilter(getEntries: () => Entry[], selectedWeek = currentWeekKey()) {
  let filter!: ReturnType<typeof createEntriesFilter>;
  const cleanup = $effect.root(() => {
    filter = createEntriesFilter(getEntries, () => selectedWeek);
  });
  flushSync();
  return { filter, cleanup };
}

describe("currentWeekKey / entry-form default date agreement (#108)", () => {
  const originalTZ = process.env.TZ;
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTZ;
  });

  it("a new Entry's default date always falls in the currently-selected week, even near a UTC-offset midnight boundary", () => {
    process.env.TZ = "America/New_York"; // UTC-4 in summer (EDT)
    vi.useFakeTimers();
    // 2026-05-24T02:00:00Z is still 2026-05-23 22:00 in New York — a Saturday.
    vi.setSystemTime(new Date("2026-05-24T02:00:00Z"));

    const form = createEntryForm(() => CATEGORIES);
    expect(weekStartOf(form.date)).toBe(currentWeekKey());
  });

  it("currentWeekKey is derived from today()", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T12:00:00"));
    expect(currentWeekKey()).toBe(weekStartOf(today()));
  });
});

describe("createEntriesFilter — reads entries from the injected getter, not the store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24")); // Sunday → current week key "2026-05-24"
  });
  afterEach(() => vi.useRealTimers());

  it("uses the route-selected week, showing only entries within it", () => {
    const entries = [
      entry(1, "2026-05-04"), // week of 2026-05-03
      entry(2, "2026-05-24"), // current week
    ];
    const { filter, cleanup } = renderFilter(() => entries);
    expect(filter.filtered.map(e => e.id)).toEqual([2]);
    cleanup();
  });

  it("setDirection filters by direction and clears any set category", () => {
    const entries = [
      entry(1, "2026-05-24", { direction: "O" }),
      entry(2, "2026-05-24", { direction: "I" }),
    ];
    const { filter, cleanup } = renderFilter(() => entries);
    filter.setCategory("FOOD");
    filter.setDirection("I");
    expect(filter.filterCat).toBe("");
    expect(filter.filtered.map(e => e.id)).toEqual([2]);
    cleanup();
  });

  it("setCategory filters by mainCategory", () => {
    const entries = [
      entry(1, "2026-05-24", { mainCategory: "FOOD" }),
      entry(2, "2026-05-24", { mainCategory: "TRANSIT" }),
    ];
    const { filter, cleanup } = renderFilter(() => entries);
    filter.setCategory("TRANSIT");
    expect(filter.filtered.map(e => e.id)).toEqual([2]);
    cleanup();
  });

  it("selectableWeeks always includes the current week even with no entries in it", () => {
    const entries = [entry(1, "2026-05-04")]; // week of 2026-05-03
    const { filter, cleanup } = renderFilter(() => entries);
    const keys = filter.selectableWeeks().map(w => w.key);
    expect(keys).toContain("2026-05-24");
    expect(keys).toContain("2026-05-03");
    cleanup();
  });

  it("catCounts respects the current direction filter", () => {
    const entries = [
      entry(1, "2026-05-24", { mainCategory: "FOOD", direction: "O" }),
      entry(2, "2026-05-24", { mainCategory: "FOOD", direction: "I" }),
    ];
    const { filter, cleanup } = renderFilter(() => entries);
    filter.setDirection("O");
    expect(filter.catCounts["FOOD"]).toBe(1);
    cleanup();
  });
});

describe("createEntriesFilter — route-owned week", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24")); // Sunday → current week key "2026-05-24"
  });
  afterEach(() => vi.useRealTimers());

  it("keeps an empty historical route week selected when filters exclude its entries", () => {
    const entries = [
      { ...entry(1, "2026-05-04"), direction: "O" as const }, // week of 2026-05-03, Outgoing only
      { ...entry(2, "2026-05-24"), direction: "I" as const }, // current week, Incoming
    ];
    const { filter, cleanup } = renderFilter(() => entries, "2026-05-03");
    filter.setDirection("I");
    flushSync();
    expect(filter.filtered).toEqual([]);
    expect(filter.selectableWeeks().map((week) => week.key)).toContain("2026-05-03");

    cleanup();
  });

  it("includes a valid empty historical route week in the picker", () => {
    const { filter, cleanup } = renderFilter(() => [], "2025-01-05");
    expect(filter.selectableWeeks().map((week) => week.key)).toContain("2025-01-05");

    cleanup();
  });
});
