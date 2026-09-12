import { describe, expect, it } from "vitest";
import {
  columnIndexWithinRange,
  columnToA1,
  rangeWidth,
  SHEET_LAYOUT,
} from "./0_sheetLayout";

describe("SHEET_LAYOUT", () => {
  it("defines every managed sheet with fixed 1-based coordinates", () => {
    expect(SHEET_LAYOUT).toEqual({
      io: {
        name: "INCOMING/OUTGOING",
        rows: { header: 1, dataFirst: 2 },
        columns: {
          date: 2,
          tag: 3,
          mainCategory: 4,
          description: 5,
          direction: 6,
          amount: 7,
          entryId: 8,
          mutationId: 9,
        },
      },
      master: {
        name: "MASTER",
        rows: { header: 2, data: 3 },
        columns: { first: 1 },
      },
      categories: {
        name: "Categories",
        rows: { header: 1, dataFirst: 2 },
        columns: { subcategory: 2, category: 3 },
      },
      config: {
        name: "Config",
        rows: { dataFirst: 1 },
        columns: { key: 1, value: 2 },
      },
      stats: {
        name: "STATS",
        rows: {
          title: 1,
          categoryHeader: 2,
          categoryFirst: 3,
          categoryLast: 9,
          paceSeparator: 10,
          paceHeader: 11,
          paceFirst: 12,
          paceLast: 42,
          windowSeparator: 43,
          windowTotalsHeader: 44,
          windowTotalsFirst: 45,
          windowTotalsLast: 47,
          windowCategorySeparator: 48,
          windowCategoryHeader: 49,
          windowCategoryFirst: 50,
          windowCategoryLast: 70,
        },
        columns: {
          categoryMonth: { category: 1, incoming: 2, outgoing: 3, netChange: 4 },
          pace: { day: 1, thisMonth: 2, usual: 3 },
          windowTotals: { window: 1, incoming: 2, outgoing: 3, net: 4 },
          windowCategory: { window: 1, category: 2, outgoing: 3 },
        },
      },
    });
  });
});

describe("columnToA1", () => {
  it("converts 1-based column numbers through and beyond Z", () => {
    expect([1, 26, 27, 52, 53, 703].map(columnToA1)).toEqual([
      "A",
      "Z",
      "AA",
      "AZ",
      "BA",
      "AAA",
    ]);
  });

  it("rejects values that are not positive integer coordinates", () => {
    for (const column of [0, -1, 1.5, Number.NaN]) {
      expect(() => columnToA1(column)).toThrow("positive integer");
    }
  });
});

describe("range coordinate conversion", () => {
  it("derives widths and zero-based returned-value positions from 1-based coordinates", () => {
    const columns = SHEET_LAYOUT.io.columns;

    expect(rangeWidth(columns.date, columns.mutationId)).toBe(8);
    expect(columnIndexWithinRange(columns.entryId, columns.date)).toBe(6);
    expect(columnIndexWithinRange(columns.mutationId, columns.date)).toBe(7);
  });
});
