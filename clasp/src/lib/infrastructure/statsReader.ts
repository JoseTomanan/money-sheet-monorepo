// STATS sheet reader — formula-driven, GAS read-only (mirrors masterReader.ts /
// MASTER; see docs/adr/0011 and stats.ts for the full layout doc + the
// exact formulas written into the sheet by ensureStatsSheet).
//
// Fixed anchor rows from SHEET_LAYOUT locate the data
// blocks — never use getLastRow() to find them, same invariant as MASTER's
// "always row 3" (extra rows appended below would shift getLastRow() past
// the real data).
import type {
  CategoryMonthChange,
  SpendingPaceDay,
  StatsData,
  StatsWindow,
  WindowCategorySpend,
  WindowTotal,
} from "../application/dispatch";
import { columnIndexWithinRange, rangeWidth, SHEET_LAYOUT } from "./sheetLayout";
import { getStatsSheetOrNull } from "./sheets";

export function getStats(): StatsData {
  const sh = getStatsSheetOrNull();
  if (!sh) return { categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] };

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
      incoming: Number(row[columnIndexWithinRange(
        categoryColumns.incoming, categoryColumns.category
      )]) || 0,
      outgoing: Number(row[columnIndexWithinRange(
        categoryColumns.outgoing, categoryColumns.category
      )]) || 0,
      netChange: Number(row[columnIndexWithinRange(
        categoryColumns.netChange, categoryColumns.category
      )]) || 0,
    }));

  const paceColumns = SHEET_LAYOUT.stats.columns.pace;
  const paceRowCount = SHEET_LAYOUT.stats.rows.paceLast - SHEET_LAYOUT.stats.rows.paceFirst + 1;
  const paceRows = sh.getRange(
    SHEET_LAYOUT.stats.rows.paceFirst,
    paceColumns.day,
    paceRowCount,
    rangeWidth(paceColumns.day, paceColumns.usual),
  ).getValues();
  const spendingPace: SpendingPaceDay[] = paceRows
    .filter((row) => {
      const day = row[columnIndexWithinRange(paceColumns.day, paceColumns.day)];
      return day !== "" && day !== null;
    })
    .map((row) => ({
      day: Number(row[columnIndexWithinRange(paceColumns.day, paceColumns.day)]) || 0,
      cumulativeThisMonth: Number(row[columnIndexWithinRange(
        paceColumns.thisMonth, paceColumns.day
      )]) || 0,
      cumulativeUsual: Number(row[columnIndexWithinRange(
        paceColumns.usual, paceColumns.day
      )]) || 0,
    }));

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
      incoming: Number(row[columnIndexWithinRange(
        windowColumns.incoming, windowColumns.window
      )]) || 0,
      outgoing: Number(row[columnIndexWithinRange(
        windowColumns.outgoing, windowColumns.window
      )]) || 0,
      net: Number(row[columnIndexWithinRange(
        windowColumns.net, windowColumns.window
      )]) || 0,
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
      outgoing: Number(row[columnIndexWithinRange(
        windowCategoryColumns.outgoing, windowCategoryColumns.window
      )]) || 0,
    }));

  return { categoryMonthChange, spendingPace, windowTotals, windowCategorySpend };
}
