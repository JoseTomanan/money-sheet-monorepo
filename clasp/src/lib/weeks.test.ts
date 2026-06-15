import { describe, it, expect } from "vitest";
import { formatWeekLabel, weekStartSunday, weekTier, findInsertionIndex, weekStartOfStr, weekLabelFromStr } from "./weeks";

const TZ = "Asia/Manila";

describe("findInsertionIndex", () => {
  const d = (iso: string) => new Date(iso);

  it("appends when new entry is newest", () => {
    const dates = [d("2025-05-01"), d("2025-05-05"), d("2025-05-10")];
    expect(findInsertionIndex(dates, d("2025-05-15"))).toBe(3);
  });

  it("inserts at 0 when new entry is oldest", () => {
    const dates = [d("2025-05-05"), d("2025-05-10")];
    expect(findInsertionIndex(dates, d("2025-04-30"))).toBe(0);
  });

  it("inserts mid-array for back-dated entry", () => {
    const dates = [d("2025-05-01"), d("2025-05-10"), d("2025-05-15")];
    expect(findInsertionIndex(dates, d("2025-05-07"))).toBe(1);
  });

  it("tolerates null entries: skips them and finds next non-null", () => {
    // null at index 1 (separator with no date) is skipped; May 10 at index 2 > May 5
    const dates = [d("2025-05-01"), null, d("2025-05-10")];
    expect(findInsertionIndex(dates, d("2025-05-05"))).toBe(2);
  });
});

describe("weekStartSunday", () => {
  it("Wednesday returns the prior Sunday at 00:00 in tz", () => {
    // Wednesday 2025-05-14 10:00 Manila
    const wed = new Date("2025-05-14T02:00:00Z"); // UTC+8 = 10:00 Manila
    const result = weekStartSunday(wed, TZ);
    // Expected: Sunday 2025-05-11 00:00 Manila = 2025-05-10T16:00:00Z
    expect(result.toISOString()).toBe("2025-05-10T16:00:00.000Z");
  });

  it("Sunday returns itself at 00:00 in tz", () => {
    // Sunday 2025-05-11 12:00 Manila
    const sun = new Date("2025-05-11T04:00:00Z"); // UTC+8 = 12:00 Manila
    const result = weekStartSunday(sun, TZ);
    expect(result.toISOString()).toBe("2025-05-10T16:00:00.000Z");
  });
});

describe("weekTier", () => {
  const current = new Date("2025-05-11T16:00:00.000Z"); // Sun May 11 00:00 Manila

  it("same week → current", () => {
    expect(weekTier(current, current)).toBe("current");
  });

  it("1 week ago → recent", () => {
    const oneWeekAgo = new Date(current.getTime() - 7 * 24 * 3600 * 1000);
    expect(weekTier(oneWeekAgo, current)).toBe("recent");
  });

  it("4 weeks ago → recent", () => {
    const fourWeeksAgo = new Date(current.getTime() - 4 * 7 * 24 * 3600 * 1000);
    expect(weekTier(fourWeeksAgo, current)).toBe("recent");
  });

  it("5 weeks ago → old", () => {
    const fiveWeeksAgo = new Date(current.getTime() - 5 * 7 * 24 * 3600 * 1000);
    expect(weekTier(fiveWeeksAgo, current)).toBe("old");
  });
});

describe("formatWeekLabel", () => {
  it("same-month week: MAY 11-17", () => {
    const sunday = new Date("2025-05-11T00:00:00+08:00");
    expect(formatWeekLabel(sunday, TZ)).toBe("MAY 11-17");
  });

  it("cross-month week: APR 27 - MAY 3", () => {
    const sunday = new Date("2025-04-27T00:00:00+08:00");
    expect(formatWeekLabel(sunday, TZ)).toBe("APR 27 - MAY 3");
  });
});

// ── Canonical week-start: pure date-string helpers ────────────────────────────
// weekStartOfStr and weekLabelFromStr are the single source of truth for
// "what week does a calendar date belong to?" Both clasp and frontend must
// produce identical results for the same YYYY-MM-DD input.

describe("weekStartOfStr", () => {
  it("Sunday is its own week start", () => {
    expect(weekStartOfStr("2025-05-11")).toBe("2025-05-11"); // Sun May 11
  });

  it("Saturday falls back to the preceding Sunday", () => {
    expect(weekStartOfStr("2025-05-17")).toBe("2025-05-11"); // Sat → Sun May 11
  });

  it("Wednesday falls back to the preceding Sunday", () => {
    expect(weekStartOfStr("2025-05-14")).toBe("2025-05-11"); // Wed → Sun May 11
  });

  it("Monday (first day after Sunday) maps to that Sunday", () => {
    expect(weekStartOfStr("2025-05-12")).toBe("2025-05-11"); // Mon → Sun May 11
  });

  // Boundary: Dec 31 / Jan 1 crossings
  it("Dec 31, 2025 (Wednesday) maps to week of Dec 28, 2025", () => {
    expect(weekStartOfStr("2025-12-31")).toBe("2025-12-28");
  });

  it("Jan 1, 2026 (Thursday) maps to week of Dec 28, 2025", () => {
    expect(weekStartOfStr("2026-01-01")).toBe("2025-12-28");
  });

  it("Jan 4, 2026 (Sunday) is its own week start", () => {
    expect(weekStartOfStr("2026-01-04")).toBe("2026-01-04");
  });

  it("Dec 28, 2025 (Sunday) is its own week start", () => {
    expect(weekStartOfStr("2025-12-28")).toBe("2025-12-28");
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
    expect(weekStartOfStr(date)).toBe(expectedStart);
  });
});

describe("weekLabelFromStr — matches frontend weekLabel format", () => {
  it("same-month week: May 11 – 17, 2025", () => {
    expect(weekLabelFromStr("2025-05-11")).toBe("May 11 – 17, 2025");
  });

  it("cross-month week: Apr 27 – May 3, 2025", () => {
    expect(weekLabelFromStr("2025-04-27")).toBe("Apr 27 – May 3, 2025");
  });

  it("year-boundary week: Dec 28 – Jan 3, 2026 (year of Saturday)", () => {
    // week starts Sun Dec 28, 2025 → ends Sat Jan 3, 2026 → label year = 2026 (end year)
    expect(weekLabelFromStr("2025-12-28")).toBe("Dec 28 – Jan 3, 2026");
  });

  it("week label after year boundary: Jan 4 – 10, 2026", () => {
    expect(weekLabelFromStr("2026-01-04")).toBe("Jan 4 – 10, 2026");
  });
});

describe("weekStartOfStr — timezone independence", () => {
  // These dates are chosen to differ between UTC and Asia/Manila interpretations
  // when a naive Date construction is used. weekStartOfStr must return the same
  // result regardless of the host TZ (tests run under both TZ=UTC and TZ=Asia/Manila).
  //
  // To verify manually:
  //   TZ=UTC npx vitest run src/lib/weeks.test.ts
  //   TZ=Asia/Manila npx vitest run src/lib/weeks.test.ts
  it("result is the same in any host timezone for Dec 31, 2025", () => {
    // In UTC this is Wednesday; in Manila it is still Wednesday; but a naive
    // `new Date('2025-12-31')` parsed as local-midnight gives different UTCDay values.
    const result = weekStartOfStr("2025-12-31");
    expect(result).toBe("2025-12-28");
  });

  it("result is the same in any host timezone for Jan 1, 2026", () => {
    const result = weekStartOfStr("2026-01-01");
    expect(result).toBe("2025-12-28");
  });
});

describe("weekStartOfStr — multi-year range coverage (2024–2026)", () => {
  // Spot-check one date per month across 2024-01-01 to 2026-12-31, plus all Dec/Jan dates.
  // Confirms no off-by-one at month and year boundaries.
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
  it.each(cases)("weekStartOfStr(%s) === %s", (date, expected) => {
    expect(weekStartOfStr(date)).toBe(expected);
  });
});
