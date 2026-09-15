/**
 * The single source of truth for GAS-managed sheet names and fixed 1-based
 * row/column coordinates. Runtime-derived bounds and zero-based values-array
 * positions must be calculated from this contract rather than stored here.
 */
export const SHEET_LAYOUT = {
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
} as const;

/** Converts a 1-based Google Sheets column number to its A1 column label. */
export function columnToA1(column: number): string {
  if (!Number.isInteger(column) || column < 1) {
    throw new Error("Column must be a positive integer");
  }
  let remaining = column;
  let label = "";
  while (remaining > 0) {
    remaining--;
    label = String.fromCharCode(65 + (remaining % 26)) + label;
    remaining = Math.floor(remaining / 26);
  }
  return label;
}

/** Inclusive number of columns between two 1-based sheet coordinates. */
export function rangeWidth(firstColumn: number, lastColumn: number): number {
  return lastColumn - firstColumn + 1;
}

/** Zero-based position of a sheet column within a returned range row. */
export function columnIndexWithinRange(column: number, firstColumn: number): number {
  return column - firstColumn;
}
