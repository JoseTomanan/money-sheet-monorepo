import { describe, it, expect } from "vitest";
import { formatWeekLabel, weekStartSunday, weekTier, findInsertionIndex } from "./weeks";

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
  it("same-month week: May 11–17", () => {
    const sunday = new Date("2025-05-11T00:00:00+08:00");
    expect(formatWeekLabel(sunday, TZ)).toBe("May 11–17");
  });

  it("cross-month week: Apr 27 – May 3", () => {
    const sunday = new Date("2025-04-27T00:00:00+08:00");
    expect(formatWeekLabel(sunday, TZ)).toBe("Apr 27 – May 3");
  });
});
