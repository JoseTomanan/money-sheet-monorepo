import { describe, it, expect } from "vitest";
import { groupByWeek, dateRunPositions, groupEntriesByDate, compareEntriesForDisplay, splitRunPositions, weekStartOf, weekLabel, recentForDisplay } from "./groupEntries";
import type { Entry } from "./types";

function entry(id: number, date: string, description = ""): Entry {
  return { id, date, tag: "T", mainCategory: "C", description, direction: "O", amount: 1 };
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

  it("formats label as 'Mon D – D, YYYY' when week is within one month", () => {
    const entries = [entry(1, "2026-05-21")]; // week: May 17 – 23
    const groups = groupByWeek(entries);
    expect(groups[0].label).toBe("May 17 – 23, 2026");
  });

  it("formats label as 'Mon D – Mon D, YYYY' when week crosses a month boundary", () => {
    const entries = [entry(1, "2026-06-01")]; // week: May 31 – Jun 6
    const groups = groupByWeek(entries);
    expect(groups[0].label).toBe("May 31 – Jun 6, 2026");
  });

  it("formats label correctly when week crosses a year boundary", () => {
    const entries = [entry(1, "2026-01-01")]; // Jan 1 2026 = Thursday → week: Dec 28 – Jan 3
    const groups = groupByWeek(entries);
    expect(groups[0].label).toBe("Dec 28 – Jan 3, 2026");
  });
});

describe("dateRunPositions", () => {
  it("returns empty array for no entries", () => {
    expect(dateRunPositions([])).toEqual([]);
  });

  it("singleton entry is both first and last of its date", () => {
    expect(dateRunPositions([entry(1, "2026-05-18")])).toEqual([
      { isFirstOfDate: true, isLastOfDate: true },
    ]);
  });

  it("all same date: first/middle/last flagged correctly", () => {
    const entries = [entry(1, "2026-05-18"), entry(2, "2026-05-18"), entry(3, "2026-05-18")];
    expect(dateRunPositions(entries)).toEqual([
      { isFirstOfDate: true,  isLastOfDate: false },
      { isFirstOfDate: false, isLastOfDate: false },
      { isFirstOfDate: false, isLastOfDate: true  },
    ]);
  });

  it("all different dates: every entry is its own first-and-last", () => {
    const entries = [entry(1, "2026-05-17"), entry(2, "2026-05-18"), entry(3, "2026-05-19")];
    expect(dateRunPositions(entries)).toEqual([
      { isFirstOfDate: true, isLastOfDate: true },
      { isFirstOfDate: true, isLastOfDate: true },
      { isFirstOfDate: true, isLastOfDate: true },
    ]);
  });

  it("mixed runs [A, A, B, C, C]", () => {
    const entries = [
      entry(1, "2026-05-17"), entry(2, "2026-05-17"),
      entry(3, "2026-05-18"),
      entry(4, "2026-05-19"), entry(5, "2026-05-19"),
    ];
    expect(dateRunPositions(entries)).toEqual([
      { isFirstOfDate: true,  isLastOfDate: false },
      { isFirstOfDate: false, isLastOfDate: true  },
      { isFirstOfDate: true,  isLastOfDate: true  },
      { isFirstOfDate: true,  isLastOfDate: false },
      { isFirstOfDate: false, isLastOfDate: true  },
    ]);
  });

  it("does not sort — input order is respected", () => {
    // Two entries reversed date order; positions reflect given order, not date order
    const entries = [entry(1, "2026-05-19"), entry(2, "2026-05-17")];
    expect(dateRunPositions(entries)).toEqual([
      { isFirstOfDate: true, isLastOfDate: true },
      { isFirstOfDate: true, isLastOfDate: true },
    ]);
  });
});

describe("groupEntriesByDate", () => {
  it("returns empty array for no entries", () => {
    expect(groupEntriesByDate([])).toEqual([]);
  });

  it("single entry produces one group", () => {
    const result = groupEntriesByDate([entry(1, "2026-05-18")]);
    expect(result).toHaveLength(1);
    expect(result[0].map(e => e.id)).toEqual([1]);
  });

  it("same date entries form one group", () => {
    const entries = [entry(1, "2026-05-18"), entry(2, "2026-05-18"), entry(3, "2026-05-18")];
    const result = groupEntriesByDate(entries);
    expect(result).toHaveLength(1);
    expect(result[0].map(e => e.id)).toEqual([1, 2, 3]);
  });

  it("different dates each form their own group", () => {
    const entries = [entry(1, "2026-05-17"), entry(2, "2026-05-18"), entry(3, "2026-05-19")];
    const result = groupEntriesByDate(entries);
    expect(result).toHaveLength(3);
    expect(result.map(g => g[0].id)).toEqual([1, 2, 3]);
  });

  it("mixed [A, A, B, C, C] produces three groups", () => {
    const entries = [
      entry(1, "2026-05-17"), entry(2, "2026-05-17"),
      entry(3, "2026-05-18"),
      entry(4, "2026-05-19"), entry(5, "2026-05-19"),
    ];
    const result = groupEntriesByDate(entries);
    expect(result).toHaveLength(3);
    expect(result[0].map(e => e.id)).toEqual([1, 2]);
    expect(result[1].map(e => e.id)).toEqual([3]);
    expect(result[2].map(e => e.id)).toEqual([4, 5]);
  });

  it("does not merge non-consecutive same-date entries", () => {
    // A, B, A — the two A's are not consecutive, so they stay in separate groups
    const entries = [entry(1, "2026-05-17"), entry(2, "2026-05-18"), entry(3, "2026-05-17")];
    const result = groupEntriesByDate(entries);
    expect(result).toHaveLength(3);
  });
});

describe("splitRunPositions", () => {
  it("lone entry is isFirst+isLast, not inGroup", () => {
    expect(splitRunPositions([entry(1, "2026-05-18", "coffee")])).toEqual([
      { isFirst: true, isLast: true, inGroup: false },
    ]);
  });

  it("two-leg split: first leg isFirst+inGroup, ditto leg isLast+inGroup", () => {
    const entries = [entry(1, "2026-05-18", "dinner"), entry(2, "2026-05-18", "^^")];
    expect(splitRunPositions(entries)).toEqual([
      { isFirst: true,  isLast: false, inGroup: true },
      { isFirst: false, isLast: true,  inGroup: true },
    ]);
  });

  it("three-leg split: first/middle/last flags correct", () => {
    const entries = [
      entry(1, "2026-05-18", "groceries"),
      entry(2, "2026-05-18", "^^"),
      entry(3, "2026-05-18", "^^"),
    ];
    expect(splitRunPositions(entries)).toEqual([
      { isFirst: true,  isLast: false, inGroup: true },
      { isFirst: false, isLast: false, inGroup: true },
      { isFirst: false, isLast: true,  inGroup: true },
    ]);
  });

  it("same-description non-^^ batch: each entry is lone (no false grouping)", () => {
    const entries = [
      entry(25, "2026-05-17", "internship payday!"),
      entry(26, "2026-05-17", "internship payday!"),
      entry(27, "2026-05-17", "internship payday!"),
    ];
    expect(splitRunPositions(entries)).toEqual([
      { isFirst: true, isLast: true, inGroup: false },
      { isFirst: true, isLast: true, inGroup: false },
      { isFirst: true, isLast: true, inGroup: false },
    ]);
  });

  it("ditto leg with trailing text past '^^' still groups (prefix match, not exact equality)", () => {
    const entries = [entry(1, "2026-05-18", "dinner"), entry(2, "2026-05-18", "^^ extra detail")];
    expect(splitRunPositions(entries)).toEqual([
      { isFirst: true,  isLast: false, inGroup: true },
      { isFirst: false, isLast: true,  inGroup: true },
    ]);
  });

  it("split group followed by lone entry: split is closed correctly", () => {
    const entries = [
      entry(1, "2026-05-18", "utilities"),
      entry(2, "2026-05-18", "^^"),
      entry(3, "2026-05-18", "coffee"),
    ];
    expect(splitRunPositions(entries)).toEqual([
      { isFirst: true,  isLast: false, inGroup: true  },
      { isFirst: false, isLast: true,  inGroup: true  },
      { isFirst: true,  isLast: true,  inGroup: false },
    ]);
  });
});

describe("recentForDisplay", () => {
  it("returns empty array for no entries", () => {
    expect(recentForDisplay([], 2)).toEqual([]);
  });

  it("returns all entries in display order when fewer than count", () => {
    const entries = [entry(1, "2026-05-18")];
    expect(recentForDisplay(entries, 2).map(e => e.id)).toEqual([1]);
  });

  it("returns the last `count` entries in display order, not input order", () => {
    const entries = [
      entry(3, "2026-05-20"),
      entry(1, "2026-05-18"),
      entry(2, "2026-05-19"),
    ];
    expect(recentForDisplay(entries, 2).map(e => e.id)).toEqual([2, 3]);
  });
});

describe("compareEntriesForDisplay", () => {
  describe("same date — committed entries", () => {
    it("sorts by id ascending when both ids are positive", () => {
      const a = entry(1, "2026-06-01");
      const b = entry(2, "2026-06-01");
      expect(compareEntriesForDisplay(a, b)).toBeLessThan(0);
      expect(compareEntriesForDisplay(b, a)).toBeGreaterThan(0);
      expect([b, a].sort(compareEntriesForDisplay)).toEqual([a, b]);
    });

    it("returns 0 for the same entry", () => {
      const e = entry(5, "2026-06-01");
      expect(compareEntriesForDisplay(e, e)).toBe(0);
    });
  });

  describe("same date — optimistic (negative) temp id sorts last", () => {
    it("places a negative-id entry after a positive-id entry", () => {
      const committed  = entry(10, "2026-06-01");
      const optimistic = entry(-Date.now(), "2026-06-01");
      const sorted = [optimistic, committed].sort(compareEntriesForDisplay);
      expect(sorted[0]).toBe(committed);
      expect(sorted[1]).toBe(optimistic);
    });

    it("places multiple negative-id entries after all positive-id entries", () => {
      const c1 = entry(3,    "2026-06-01");
      const c2 = entry(7,    "2026-06-01");
      const t1 = entry(-1000, "2026-06-01");
      const t2 = entry(-1001, "2026-06-01");
      const sorted = [t2, c2, t1, c1].sort(compareEntriesForDisplay);
      expect(sorted[0]).toBe(c1);
      expect(sorted[1]).toBe(c2);
      expect(sorted[2].id).toBeLessThan(0);
      expect(sorted[3].id).toBeLessThan(0);
    });
  });

  describe("different dates — date takes priority over id", () => {
    it("earlier date before later date regardless of id sign", () => {
      const early      = entry(999,  "2026-05-31");
      const late       = entry(1,    "2026-06-01");
      const optimistic = entry(-1,   "2026-06-01");
      const sorted = [late, optimistic, early].sort(compareEntriesForDisplay);
      expect(sorted[0]).toBe(early);
    });

    it("negative id on an earlier date sorts before positive id on a later date", () => {
      const yesterday = entry(-9999, "2026-05-31");
      const today     = entry(1,     "2026-06-01");
      expect(compareEntriesForDisplay(yesterday, today)).toBeLessThan(0);
    });
  });
});

// ── Canonical week-start: pure date-string helpers ─────────────────────────
// These tests mirror clasp/src/lib/weeks.test.ts "weekStartOfStr" suite.
// Both packages must produce identical results for the same calendar date.
// To verify TZ-independence run: TZ=UTC npx vitest run and TZ=Asia/Manila npx vitest run

describe("weekStartOf — canonical Sunday-start", () => {
  it("Sunday is its own week start", () => {
    expect(weekStartOf("2025-05-11")).toBe("2025-05-11");
  });

  it("Saturday falls back to the preceding Sunday", () => {
    expect(weekStartOf("2025-05-17")).toBe("2025-05-11");
  });

  it("Wednesday falls back to the preceding Sunday", () => {
    expect(weekStartOf("2025-05-14")).toBe("2025-05-11");
  });

  it("Monday maps to that Sunday", () => {
    expect(weekStartOf("2025-05-12")).toBe("2025-05-11");
  });

  // Boundary: Dec 31 / Jan 1 crossings
  it("Dec 31, 2025 (Wednesday) maps to week of Dec 28, 2025", () => {
    expect(weekStartOf("2025-12-31")).toBe("2025-12-28");
  });

  it("Jan 1, 2026 (Thursday) maps to week of Dec 28, 2025", () => {
    expect(weekStartOf("2026-01-01")).toBe("2025-12-28");
  });

  it("Jan 4, 2026 (Sunday) is its own week start", () => {
    expect(weekStartOf("2026-01-04")).toBe("2026-01-04");
  });

  it("Dec 28, 2025 (Sunday) is its own week start", () => {
    expect(weekStartOf("2025-12-28")).toBe("2025-12-28");
  });

  // All seven weekdays in one week (Sun May 11 – Sat May 17, 2025)
  it.each([
    ["2025-05-11", "2025-05-11"], // Sun
    ["2025-05-12", "2025-05-11"], // Mon
    ["2025-05-13", "2025-05-11"], // Tue
    ["2025-05-14", "2025-05-11"], // Wed
    ["2025-05-15", "2025-05-11"], // Thu
    ["2025-05-16", "2025-05-11"], // Fri
    ["2025-05-17", "2025-05-11"], // Sat
  ])("date %s belongs to week starting %s", (date, expectedStart) => {
    expect(weekStartOf(date)).toBe(expectedStart);
  });
});

describe("weekStartOf — timezone independence", () => {
  // Dates that would differ if parsed as local midnight in different TZs.
  // weekStartOf must return the same result regardless of TZ=UTC or TZ=Asia/Manila.
  it("Dec 31, 2025 always maps to Dec 28, 2025", () => {
    expect(weekStartOf("2025-12-31")).toBe("2025-12-28");
  });

  it("Jan 1, 2026 always maps to Dec 28, 2025", () => {
    expect(weekStartOf("2026-01-01")).toBe("2025-12-28");
  });
});

describe("weekStartOf — multi-year range coverage (2024–2026)", () => {
  const cases: [string, string][] = [
    // Year-boundary week: Dec 29, 2024 (Sun) → Jan 4, 2025 (Sat)
    ["2024-12-29", "2024-12-29"], // Sun
    ["2024-12-30", "2024-12-29"], // Mon
    ["2024-12-31", "2024-12-29"], // Tue
    ["2025-01-01", "2024-12-29"], // Wed — belongs to 2024's last week
    ["2025-01-04", "2024-12-29"], // Sat — still Dec 29 week
    ["2025-01-05", "2025-01-05"], // Sun — new week starts
    // Year-boundary week: Dec 28, 2025 (Sun) → Jan 3, 2026 (Sat)
    ["2025-12-28", "2025-12-28"], // Sun
    ["2025-12-31", "2025-12-28"], // Wed
    ["2026-01-01", "2025-12-28"], // Thu
    ["2026-01-03", "2025-12-28"], // Sat
    ["2026-01-04", "2026-01-04"], // Sun — new week starts
    // Mid-year samples
    ["2024-06-15", "2024-06-09"], // Sat → Sun Jun 9
    ["2025-03-15", "2025-03-09"], // Sat → Sun Mar 9
    ["2025-07-04", "2025-06-29"], // Fri → Sun Jun 29
    ["2026-11-01", "2026-11-01"], // Sun
  ];
  it.each(cases)("weekStartOf(%s) === %s", (date, expected) => {
    expect(weekStartOf(date)).toBe(expected);
  });
});

describe("weekLabel — format matches clasp weekLabelFromStr", () => {
  it("same-month week: May 11 – 17, 2025", () => {
    expect(weekLabel("2025-05-11")).toBe("May 11 – 17, 2025");
  });

  it("cross-month week: Apr 27 – May 3, 2025", () => {
    expect(weekLabel("2025-04-27")).toBe("Apr 27 – May 3, 2025");
  });

  it("year-boundary week: Dec 28 – Jan 3, 2026 (year of Saturday)", () => {
    expect(weekLabel("2025-12-28")).toBe("Dec 28 – Jan 3, 2026");
  });

  it("week label after year boundary: Jan 4 – 10, 2026", () => {
    expect(weekLabel("2026-01-04")).toBe("Jan 4 – 10, 2026");
  });
});
