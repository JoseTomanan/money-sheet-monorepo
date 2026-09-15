/**
 * STATS sheet — formula-driven, GAS read-only (mirrors MASTER, docs/adr/0011).
 * `ensureStatsSheet` records the one-time creation routine used to build or
 * repair the maintained template's fixed layout and cell formulas.
 * `statsReader.ts`'s `getStats()` reads it back — GAS never writes into the data
 * cells after creation.
 *
 * ## Sheet layout (fixed anchor rows — never use getLastRow() to locate data,
 * same invariant as MASTER's "always row 3")
 *
 * ```
 * Row 1:  "STATS"  (title, informational only)
 * Row 2:  CATEGORY | INCOMING (MTD) | OUTGOING (MTD) | NET CHANGE (MTD)   <- header
 * Row 3..(2+N): one row per fixed Category (N = STATS_CATEGORIES.length)
 *         A = category name (literal)
 *         B = SUMIFS: this-calendar-month incoming tagged to the Category
 *         C = SUMIFS: this-calendar-month outgoing resolving to the Category
 *         D = B - C  (net change)
 * Row (3+N): blank separator
 * Row (4+N): DAY | CUMULATIVE OUTGOING (THIS MONTH) | CUMULATIVE OUTGOING (USUAL)  <- header
 * Row (5+N)..(4+N+31): one row per day-of-month 1..31
 *         A = day number (literal)
 *         B = cumulative outgoing this calendar month through day A
 *         C = average, across TRAILING_MONTHS prior full calendar months, of
 *             cumulative outgoing through day A of that month ("usual" baseline)
 * -- #132 rolling-window blocks below, added after the pace block --
 * Row (5+N+31): blank separator
 * Row (6+N+31): WINDOW | INCOMING | OUTGOING | NET   <- header
 * Row (7+N+31)..(6+N+31+W): one row per rolling window (W = STATS_WINDOWS.length)
 *         A = window key, literal ("30d" | "3mo" | "12mo")
 *         B = SUMIFS: incoming in [window start, TODAY()]
 *         C = SUMIFS: outgoing in [window start, TODAY()]
 *         D = B - C  (net — the "grew/shrank" verdict)
 * Row (7+N+31+W): blank separator
 * Row (8+N+31+W): WINDOW | CATEGORY | OUTGOING   <- header
 * Row (9+N+31+W)..(8+N+31+W+W*N): one row per (window, Category) pair —
 *         windows outer loop, categories inner loop, same window/category
 *         order as STATS_WINDOWS / STATS_CATEGORIES
 *         A = window key, literal
 *         B = category name, literal
 *         C = SUMIFS: outgoing resolving to the Category in [window start, TODAY()]
 * ```
 *
 * With the current STATS_CATEGORIES (7 entries) and STATS_WINDOWS (3 entries)
 * that resolves to: category rows 3-9, separator row 10, pace header row 11,
 * pace rows 12-42, separator row 43, window-totals header row 44, window-totals
 * rows 45-47, separator row 48, window-category header row 49, window-category
 * rows 50-70. `SHEET_LAYOUT.stats.rows` is the source of truth for these offsets —
 * read it, don't recompute from STATS_CATEGORIES.length/STATS_WINDOWS.length
 * by hand.
 *
 * IMPORTANT — these formulas have NOT been executed against a live
 * spreadsheet. They're written to match MASTER's SUMIF/ARRAYFORMULA
 * conventions and are believed correct, but verifying them against a real
 * sheet (date-boundary edge cases, EOMONTH behavior across year boundaries,
 * merged/blank rows in INCOMING/OUTGOING) is explicitly deferred — flagged
 * in the issue #129 report and, for the #132 window blocks, in the #132 report.
 */

import { CATEGORY_ORDER } from "../domain/category";
import { columnToA1, SHEET_LAYOUT } from "./sheetLayout";

// Backwards-compatible name for STATS consumers; the ordered domain lives in
// categories.ts and is also used by MASTER parsing.
export const STATS_CATEGORIES = CATEGORY_ORDER;

// How many trailing FULL calendar months feed the spending-pace "usual" baseline.
export const TRAILING_MONTHS = 3;

// Spending-pace rows always span 1-31 so the sheet layout is stable across
// months; days that don't exist in the current month evaluate to "" (blank),
// filtered out by statsReader.ts.
export const PACE_DAYS = 31;

/**
 * Rolling windows for the Deeper Statistics page (#132), trailing back from
 * TODAY(). Capped at ~1 year — no all-time statistics (money-sheet
 * architecture contract). `startFormula` is the sheet-formula fragment for
 * the window's inclusive start date bound; the end bound is always TODAY().
 */
export interface StatsWindowDef {
  key: "30d" | "3mo" | "12mo";
  startFormula: string;
}

export const STATS_WINDOWS: StatsWindowDef[] = [
  { key: "30d", startFormula: "TODAY()-30" },
  { key: "3mo", startFormula: "EDATE(TODAY(),-3)" },
  { key: "12mo", startFormula: "EDATE(TODAY(),-12)" },
];

/** Builds an absolute whole-column A1 reference from a numeric coordinate. */
function quotedFullColumn(sheetName: string, column: number): string {
  const label = columnToA1(column);
  return `'${sheetName}'!$${label}:$${label}`;
}

/** Builds a same-sheet A1 cell reference from numeric coordinates. */
function rowCell(column: number, row: number, absoluteColumn = false): string {
  return `${absoluteColumn ? "$" : ""}${columnToA1(column)}${row}`;
}

/**
 * Builds the three formula cells (incoming, outgoing, net) for one Category
 * row of the "this calendar month" net-change table. `row` is the 1-indexed
 * sheet row the category's own name lives in (column A), so the formulas can
 * reference `$A{row}` instead of hardcoding the category string twice.
 */
export function categoryMonthChangeFormulas(row: number): { incoming: string; outgoing: string; net: string } {
  const io = SHEET_LAYOUT.io.columns;
  const stats = SHEET_LAYOUT.stats.columns.categoryMonth;
  const ioDate = quotedFullColumn(SHEET_LAYOUT.io.name, io.date);
  const ioAmount = quotedFullColumn(SHEET_LAYOUT.io.name, io.amount);
  const ioDirection = quotedFullColumn(SHEET_LAYOUT.io.name, io.direction);
  const ioMainCategory = quotedFullColumn(SHEET_LAYOUT.io.name, io.mainCategory);
  const categoryCell = rowCell(stats.category, row, true);
  const boundsThisMonth =
    `${ioDate},">="&EOMONTH(TODAY(),-1)+1,${ioDate},"<="&EOMONTH(TODAY(),0)`;
  const incoming =
    `=SUMIFS(${ioAmount},${ioDirection},"I",${ioMainCategory},${categoryCell},${boundsThisMonth})`;
  const outgoing =
    `=SUMIFS(${ioAmount},${ioDirection},"O",${ioMainCategory},${categoryCell},${boundsThisMonth})`;
  const net = `=${rowCell(stats.incoming, row)}-${rowCell(stats.outgoing, row)}`;
  return { incoming, outgoing, net };
}

/**
 * Builds the two formula cells (this-month cumulative, trailing-average
 * cumulative) for one day-of-month row of the spending-pace table. `row` is
 * the 1-indexed sheet row the day number lives in (column A).
 */
export function spendingPaceFormulas(row: number): { thisMonth: string; usual: string } {
  const io = SHEET_LAYOUT.io.columns;
  const stats = SHEET_LAYOUT.stats.columns.pace;
  const ioDate = quotedFullColumn(SHEET_LAYOUT.io.name, io.date);
  const ioAmount = quotedFullColumn(SHEET_LAYOUT.io.name, io.amount);
  const ioDirection = quotedFullColumn(SHEET_LAYOUT.io.name, io.direction);
  const dayCell = rowCell(stats.day, row, true);
  const dayGuard = `${dayCell}>DAY(EOMONTH(TODAY(),0))`;

  const thisMonth =
    `=IF(${dayGuard},"",SUMIFS(${ioAmount},${ioDirection},"O",` +
    `${ioDate},">="&EOMONTH(TODAY(),-1)+1,` +
    `${ioDate},"<="&MIN(EOMONTH(TODAY(),-1)+${dayCell},TODAY())))`;

  const monthTerms: string[] = [];
  for (let m = 1; m <= TRAILING_MONTHS; m++) {
    monthTerms.push(
      `SUMIFS(${ioAmount},${ioDirection},"O",` +
        `${ioDate},">="&EOMONTH(TODAY(),-${m})+1,` +
        `${ioDate},"<="&MIN(EOMONTH(TODAY(),-${m})+${dayCell},EOMONTH(TODAY(),-${m - 1})))`
    );
  }
  const usual = `=IF(${dayGuard},"",IFERROR(AVERAGE(${monthTerms.join(",")}),0))`;

  return { thisMonth, usual };
}

/**
 * Builds the three formula cells (incoming, outgoing, net) for one rolling
 * window's row of the window-totals table. `row` is the 1-indexed sheet row
 * (used only for the net formula's own-row B/C references); `startFormula`
 * is the window's inclusive start-date bound (see `STATS_WINDOWS`) — the end
 * bound is always TODAY().
 */
export function windowTotalFormulas(row: number, startFormula: string): { incoming: string; outgoing: string; net: string } {
  const io = SHEET_LAYOUT.io.columns;
  const stats = SHEET_LAYOUT.stats.columns.windowTotals;
  const ioDate = quotedFullColumn(SHEET_LAYOUT.io.name, io.date);
  const ioAmount = quotedFullColumn(SHEET_LAYOUT.io.name, io.amount);
  const ioDirection = quotedFullColumn(SHEET_LAYOUT.io.name, io.direction);
  const bounds = `${ioDate},">="&${startFormula},${ioDate},"<="&TODAY()`;
  const incoming = `=SUMIFS(${ioAmount},${ioDirection},"I",${bounds})`;
  const outgoing = `=SUMIFS(${ioAmount},${ioDirection},"O",${bounds})`;
  const net = `=${rowCell(stats.incoming, row)}-${rowCell(stats.outgoing, row)}`;
  return { incoming, outgoing, net };
}

/**
 * Builds the outgoing formula cell for one (window, Category) row of the
 * window-category-spend table. `row` is the 1-indexed sheet row the Category
 * name lives in (column B), so the formula references `$B{row}` instead of
 * hardcoding the category string twice. `startFormula` is the window's
 * inclusive start-date bound — the end bound is always TODAY().
 */
export function windowCategorySpendFormulas(row: number, startFormula: string): { outgoing: string } {
  const io = SHEET_LAYOUT.io.columns;
  const stats = SHEET_LAYOUT.stats.columns.windowCategory;
  const ioDate = quotedFullColumn(SHEET_LAYOUT.io.name, io.date);
  const ioAmount = quotedFullColumn(SHEET_LAYOUT.io.name, io.amount);
  const ioDirection = quotedFullColumn(SHEET_LAYOUT.io.name, io.direction);
  const ioMainCategory = quotedFullColumn(SHEET_LAYOUT.io.name, io.mainCategory);
  const categoryCell = rowCell(stats.category, row, true);
  const outgoing =
    `=SUMIFS(${ioAmount},${ioDirection},"O",${ioMainCategory},${categoryCell},` +
    `${ioDate},">="&${startFormula},${ioDate},"<="&TODAY())`;
  return { outgoing };
}

/**
 * Creates the STATS sheet and seeds it with the fixed layout + formulas when
 * it doesn't already exist. No-op when the sheet is already present — GAS
 * never rewrites STATS cells after creation (they're live formulas; editing
 * them again would just re-insert the same text).
 *
 * Takes `ss` as a parameter (dependency injection) so this pure function can
 * be unit-tested with a fake spreadsheet without touching SpreadsheetApp,
 * mirroring `ensureConfigSheet` (infrastructure/config.ts).
 */
export function ensureStatsSheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  if (ss.getSheetByName(SHEET_LAYOUT.stats.name)) return;
  const sheet = ss.insertSheet(SHEET_LAYOUT.stats.name);

  sheet.appendRow(["STATS", "", "", ""]);
  sheet.appendRow(["CATEGORY", "INCOMING (MTD)", "OUTGOING (MTD)", "NET CHANGE (MTD)"]);

  STATS_CATEGORIES.forEach((category, i) => {
    const row = SHEET_LAYOUT.stats.rows.categoryFirst + i;
    const { incoming, outgoing, net } = categoryMonthChangeFormulas(row);
    sheet.appendRow([category, incoming, outgoing, net]);
  });

  sheet.appendRow(["", "", "", ""]);
  sheet.appendRow(["DAY", "CUMULATIVE OUTGOING (THIS MONTH)", "CUMULATIVE OUTGOING (USUAL)"]);

  for (let day = 1; day <= PACE_DAYS; day++) {
    const row = SHEET_LAYOUT.stats.rows.paceFirst + day - 1;
    const { thisMonth, usual } = spendingPaceFormulas(row);
    sheet.appendRow([day, thisMonth, usual]);
  }

  // #132 rolling-window blocks — appended after the #129 pace block so its
  // fixed rows are untouched. See the module doc comment for the layout.
  sheet.appendRow(["", "", "", ""]);
  sheet.appendRow(["WINDOW", "INCOMING", "OUTGOING", "NET"]);

  STATS_WINDOWS.forEach((w, i) => {
    const row = SHEET_LAYOUT.stats.rows.windowTotalsFirst + i;
    const { incoming, outgoing, net } = windowTotalFormulas(row, w.startFormula);
    sheet.appendRow([w.key, incoming, outgoing, net]);
  });

  sheet.appendRow(["", "", ""]);
  sheet.appendRow(["WINDOW", "CATEGORY", "OUTGOING"]);

  STATS_WINDOWS.forEach((w, wi) => {
    STATS_CATEGORIES.forEach((category, ci) => {
      const row = SHEET_LAYOUT.stats.rows.windowCategoryFirst
        + wi * STATS_CATEGORIES.length
        + ci;
      const { outgoing } = windowCategorySpendFormulas(row, w.startFormula);
      sheet.appendRow([w.key, category, outgoing]);
    });
  });
}
