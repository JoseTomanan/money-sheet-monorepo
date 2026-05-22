import { describe, it, expect } from "vitest";
import { groupByWeek } from "./groupEntries";
import type { Entry } from "./types";

function entry(id: number, date: string): Entry {
  return { id, date, tag: "T", mainCategory: "C", description: "", direction: "O", amount: 1 };
}

describe("groupByWeek", () => {
  it("returns empty array for no entries", () => {
    expect(groupByWeek([])).toEqual([]);
  });

  it("groups entries in the same week into one group", () => {
    const entries = [
      entry(1, "2026-05-18"), // Monday
      entry(2, "2026-05-21"), // Thursday
    ];
    const groups = groupByWeek(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(2);
  });

  it("uses the preceding Sunday as the week key", () => {
    const entries = [entry(1, "2026-05-21")]; // Thursday May 21 → Sun May 17
    const groups = groupByWeek(entries);
    expect(groups[0].key).toBe("2026-05-17");
  });

  it("Sunday itself is its own week start", () => {
    const entries = [entry(1, "2026-05-17")]; // Sunday May 17
    const groups = groupByWeek(entries);
    expect(groups[0].key).toBe("2026-05-17");
  });

  it("Saturday falls in the same week as its preceding Sunday", () => {
    const sat = entry(1, "2026-05-23"); // Saturday → week starts Sun May 17
    const sun = entry(2, "2026-05-17"); // Sunday
    const groups = groupByWeek([sun, sat]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("2026-05-17");
  });

  it("entries in different weeks produce separate groups in chronological order", () => {
    const entries = [
      entry(1, "2026-05-21"), // week of May 17
      entry(2, "2026-05-25"), // week of May 24
      entry(3, "2026-06-01"), // week of May 31
    ];
    const groups = groupByWeek(entries);
    expect(groups).toHaveLength(3);
    expect(groups[0].key).toBe("2026-05-17");
    expect(groups[1].key).toBe("2026-05-24");
    expect(groups[2].key).toBe("2026-05-31");
  });

  it("preserves entry order within a group", () => {
    const entries = [entry(1, "2026-05-18"), entry(2, "2026-05-19"), entry(3, "2026-05-20")];
    const groups = groupByWeek(entries);
    expect(groups[0].entries.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it("formats label as 'Mon D – D' when week is within one month", () => {
    const entries = [entry(1, "2026-05-21")]; // week: May 17 – 23
    const groups = groupByWeek(entries);
    expect(groups[0].label).toBe("May 17 – 23");
  });

  it("formats label as 'Mon D – Mon D' when week crosses a month boundary", () => {
    const entries = [entry(1, "2026-06-01")]; // week: May 31 – Jun 6
    const groups = groupByWeek(entries);
    expect(groups[0].label).toBe("May 31 – Jun 6");
  });

  it("formats label correctly when week crosses a year boundary", () => {
    const entries = [entry(1, "2026-01-01")]; // Jan 1 2026 = Thursday → week: Dec 28 – Jan 3
    const groups = groupByWeek(entries);
    expect(groups[0].label).toBe("Dec 28 – Jan 3");
  });
});
