import { describe, it, expect, vi, afterEach } from "vitest";
import { currentWeekKey } from "./entriesFilter.svelte";
import { createEntryForm } from "./entryForm.svelte";
import { weekStartOf } from "./groupEntries";
import { today } from "./format";
import type { CategoryMap } from "./types";

const CATEGORIES: CategoryMap = { FOOD: ["Groceries", "Dining"] };

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
