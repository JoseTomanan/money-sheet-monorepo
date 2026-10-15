import type { CategoryMonthChange, SpendingPaceDay, StatsData, StatsWindow, WindowCategorySpend, WindowTotal } from "../application/dispatch";
import { columnIndexWithinRange, rangeWidth, SHEET_LAYOUT } from "./sheetLayout";
import { CATEGORY_ORDER, isCategory } from "../domain/category";
import { STATS_WINDOWS } from "./stats";
import { getMasterSheet, getStatsSheetOrNull } from "./sheets";

/** Read-only boundary: no repair or financial aggregation belongs here. */
export type FinancialSheet = Pick<GoogleAppsScript.Spreadsheet.Sheet, "getLastRow" | "getLastColumn" | "getRange">;

export interface MasterRow {
  onHand: number;
  budgets: Record<string, number>;
}

// The template places hidden incoming/outgoing detail columns after each
// visible Category net-total column. They explain the formula but are not
// budgets themselves; the preceding Category cell is the canonical total.
const DETAIL_HEADERS = new Set(["I", "O"]);

/**
 * Parses MASTER's fixed header and formula rows. MASTER remains formula-owned;
 * this only turns its values into the API's existing MasterRow shape.
 */
export function parseMasterRows(headerRow: unknown[], dataRow: unknown[]): MasterRow {
  let onHand: number | undefined;
  const seen = new Set<string>();
  const budgets: Record<string, number> = {};

  for (let i = 0; i < headerRow.length; i++) {
    const header = String(headerRow[i]).trim().toUpperCase();
    if (header === "ON HAND" || isCategory(header)) {
      if (seen.has(header)) throw new Error(`Financial data unavailable: duplicate MASTER ${header}`);
      seen.add(header);
    }
    if (header === "ON HAND") {
      onHand = financialNumber(dataRow[i], `MASTER ${header}`);
    } else if (DETAIL_HEADERS.has(header)) {
      continue;
    } else if (header !== "") {
      if (!isCategory(header)) {
        throw new Error(`Unknown MASTER budget header: ${header}`);
      }
      budgets[header] = financialNumber(dataRow[i], `MASTER ${header}`);
    }
  }

  if (onHand === undefined || CATEGORY_ORDER.some(category => !(category in budgets))) {
    throw new Error("Financial data unavailable: incomplete MASTER balances");
  }
  return { onHand, budgets };
}

/** Only finite numeric cells and nonblank numeric strings are financial values. */
function financialNumber(value: unknown, cell: string): number {
  if ((typeof value !== "number" && typeof value !== "string") ||
      (typeof value === "string" && value.trim() === "") || !Number.isFinite(Number(value))) {
    throw new Error(`Financial data unavailable: invalid ${cell}`);
  }
  return Number(value);
}

export function getMaster(sh: FinancialSheet = getMasterSheet()): MasterRow {
  if (sh.getLastRow() < SHEET_LAYOUT.master.rows.data) throw new Error("Financial data unavailable: missing MASTER data row");

  // MASTER sheet: row 2 = headers, row 3 = single formula row (never use getLastRow()
  // for data — extra formula rows below would push it past the real data row)
  const headerRow = sh.getRange(
    SHEET_LAYOUT.master.rows.header,
    SHEET_LAYOUT.master.columns.first,
    1,
    rangeWidth(SHEET_LAYOUT.master.columns.first, sh.getLastColumn()),
  ).getValues()[0];
  const dataRow = sh.getRange(
    SHEET_LAYOUT.master.rows.data,
    SHEET_LAYOUT.master.columns.first,
    1,
    rangeWidth(SHEET_LAYOUT.master.columns.first, sh.getLastColumn()),
  ).getValues()[0];

  return parseMasterRows(headerRow, dataRow);
}

export function getStats(sh: FinancialSheet | null = getStatsSheetOrNull()): StatsData {
  if (!sh) throw new Error("Financial data unavailable: legacy spreadsheet has no STATS sheet");

  const categoryColumns = SHEET_LAYOUT.stats.columns.categoryMonth;
  const categoryRowCount = SHEET_LAYOUT.stats.rows.categoryLast
    - SHEET_LAYOUT.stats.rows.categoryFirst + 1;
  const categoryRows = sh.getRange(
    SHEET_LAYOUT.stats.rows.categoryFirst,
    categoryColumns.category,
    categoryRowCount,
    rangeWidth(categoryColumns.category, categoryColumns.netChange),
  ).getValues();
  const categoryMonthChange: CategoryMonthChange[] = categoryRows
    .filter((row) => String(row[
      columnIndexWithinRange(categoryColumns.category, categoryColumns.category)
    ]).trim() !== "")
    .map((row) => ({
      category: String(row[columnIndexWithinRange(
        categoryColumns.category, categoryColumns.category
      )]).trim(),
      incoming: financialNumber(row[columnIndexWithinRange(
        categoryColumns.incoming, categoryColumns.category
      )], "STATS numeric cell"),
      outgoing: financialNumber(row[columnIndexWithinRange(
        categoryColumns.outgoing, categoryColumns.category
      )], "STATS numeric cell"),
      netChange: financialNumber(row[columnIndexWithinRange(
        categoryColumns.netChange, categoryColumns.category
      )], "STATS numeric cell"),
    }));

  const paceColumns = SHEET_LAYOUT.stats.columns.pace;
  const paceRowCount = SHEET_LAYOUT.stats.rows.paceLast - SHEET_LAYOUT.stats.rows.paceFirst + 1;
  const paceRows = sh.getRange(
    SHEET_LAYOUT.stats.rows.paceFirst,
    paceColumns.day,
    paceRowCount,
    rangeWidth(paceColumns.day, paceColumns.usual),
  ).getValues();
  const spendingPace: SpendingPaceDay[] = [];
  paceRows.forEach((row, index) => {
    const dayCell = row[columnIndexWithinRange(paceColumns.day, paceColumns.day)];
    const current = row[columnIndexWithinRange(paceColumns.thisMonth, paceColumns.day)];
    const usual = row[columnIndexWithinRange(paceColumns.usual, paceColumns.day)];
    // Only the final three days can be absent or formula-suppressed. Never
    // turn blank financial cells into zero, including partially blank rows.
    if (index >= 28 && dayCell === "" && current === "" && usual === "") return;
    const day = financialNumber(dayCell, "STATS pace day");
    if (day !== index + 1) throw new Error("Financial data unavailable: invalid STATS pace day");
    if (index >= 28 && current === "" && usual === "") return;
    spendingPace.push({ day,
      cumulativeThisMonth: financialNumber(current, `STATS pace day ${day} current`),
      cumulativeUsual: financialNumber(usual, `STATS pace day ${day} usual`),
    });
  });

  // #132 rolling-window blocks — see SHEET_LAYOUT.stats.rows for the
  // fixed anchor rows appended after the #129 pace block.
  const windowColumns = SHEET_LAYOUT.stats.columns.windowTotals;
  const windowTotalsRowCount = SHEET_LAYOUT.stats.rows.windowTotalsLast
    - SHEET_LAYOUT.stats.rows.windowTotalsFirst + 1;
  const windowTotalsRows = sh.getRange(
    SHEET_LAYOUT.stats.rows.windowTotalsFirst,
    windowColumns.window,
    windowTotalsRowCount,
    rangeWidth(windowColumns.window, windowColumns.net),
  ).getValues();
  const windowTotals: WindowTotal[] = windowTotalsRows
    .filter((row) => String(row[
      columnIndexWithinRange(windowColumns.window, windowColumns.window)
    ]).trim() !== "")
    .map((row) => ({
      window: String(row[columnIndexWithinRange(
        windowColumns.window, windowColumns.window
      )]).trim() as StatsWindow,
      incoming: financialNumber(row[columnIndexWithinRange(
        windowColumns.incoming, windowColumns.window
      )], "STATS numeric cell"),
      outgoing: financialNumber(row[columnIndexWithinRange(
        windowColumns.outgoing, windowColumns.window
      )], "STATS numeric cell"),
      net: financialNumber(row[columnIndexWithinRange(
        windowColumns.net, windowColumns.window
      )], "STATS numeric cell"),
    }));

  const windowCategoryColumns = SHEET_LAYOUT.stats.columns.windowCategory;
  const windowCatRowCount = SHEET_LAYOUT.stats.rows.windowCategoryLast
    - SHEET_LAYOUT.stats.rows.windowCategoryFirst + 1;
  const windowCatRows = sh.getRange(
    SHEET_LAYOUT.stats.rows.windowCategoryFirst,
    windowCategoryColumns.window,
    windowCatRowCount,
    rangeWidth(windowCategoryColumns.window, windowCategoryColumns.outgoing),
  ).getValues();
  const windowCategorySpend: WindowCategorySpend[] = windowCatRows
    .filter((row) =>
      String(row[columnIndexWithinRange(
        windowCategoryColumns.window, windowCategoryColumns.window
      )]).trim() !== ""
      && String(row[columnIndexWithinRange(
        windowCategoryColumns.category, windowCategoryColumns.window
      )]).trim() !== ""
    )
    .map((row) => ({
      window: String(row[columnIndexWithinRange(
        windowCategoryColumns.window, windowCategoryColumns.window
      )]).trim() as StatsWindow,
      category: String(row[columnIndexWithinRange(
        windowCategoryColumns.category, windowCategoryColumns.window
      )]).trim(),
      outgoing: financialNumber(row[columnIndexWithinRange(
        windowCategoryColumns.outgoing, windowCategoryColumns.window
      )], "STATS numeric cell"),
    }));

  requireFinancialKeys(categoryMonthChange.map(row => row.category), CATEGORY_ORDER, "STATS categories");
  const windows = STATS_WINDOWS.map(window => window.key);
  requireFinancialKeys(windowTotals.map(row => row.window), windows, "STATS window totals");
  requireFinancialKeys(windowCategorySpend.map(row => `${row.window}/${row.category}`),
    windows.flatMap(window => CATEGORY_ORDER.map(category => `${window}/${category}`)), "STATS window categories");
  if (spendingPace.length < 28 || spendingPace.some((row, i) => row.day !== i + 1)) {
    throw new Error("Financial data unavailable: incomplete STATS spending pace");
  }
  return { categoryMonthChange, spendingPace, windowTotals, windowCategorySpend };
}

function requireFinancialKeys(actual: string[], required: readonly string[], block: string): void {
  if (actual.length !== required.length || new Set(actual).size !== actual.length ||
      required.some(key => !actual.includes(key))) {
    throw new Error(`Financial data unavailable: incomplete or invalid ${block}`);
  }
}
