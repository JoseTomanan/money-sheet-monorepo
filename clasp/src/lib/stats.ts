/**
 * STATS sheet — formula-driven, GAS read-only (mirrors MASTER, docs/adr/0011).
 * `ensureStatsSheet` is the one-time creation routine (called from setup(),
 * `7_setup.ts`) that writes the sheet's fixed layout and cell formulas.
 * `3_stats.ts`'s `getStats()` reads it back — GAS never writes into the data
 * cells after creation.
 *
 * ## Sheet layout (fixed anchor rows — never use getLastRow() to locate data,
 * same invariant as MASTER's "always row 3")
 *
 * ```
 * Row 1:  "STATS"  (title, informational only)
 * Row 2:  CATEGORY | INCOMING (MTD) | OUTGOING (MTD) | NET CHANGE (MTD)   <- header
 * Row 3..(2+N): one row per hardcoded Category (N = STATS_CATEGORIES.length)
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
 * ```
 *
 * With the current STATS_CATEGORIES (7 entries) that resolves to:
 * category rows 3-9, separator row 10, pace header row 11, pace rows 12-42.
 * `STATS_ROWS` below is the source of truth for these offsets — read it,
 * don't recompute from STATS_CATEGORIES.length by hand.
 *
 * IMPORTANT — these formulas have NOT been executed against a live
 * spreadsheet. They're written to match MASTER's SUMIF/ARRAYFORMULA
 * conventions and are believed correct, but verifying them against a real
 * sheet (date-boundary edge cases, EOMONTH behavior across year boundaries,
 * merged/blank rows in INCOMING/OUTGOING) is explicitly deferred — flagged
 * in the issue #129 report.
 */

export const STATS_SHEET_NAME = "STATS";

// Same hardcoded category list MASTER uses (clasp/src/3_master.ts) — a known
// weak point shared with MASTER: new Categories-sheet rows won't appear here
// without a code change. Duplicated rather than imported to keep this a pure,
// independently testable module (no cross-file coupling to the numbered GAS
// file's literal).
export const STATS_CATEGORIES = ["HOUSING", "FOOD", "TRANSIT", "HEALTH", "FINANCE", "LIFESTYLE", "MISC"];

// How many trailing FULL calendar months feed the spending-pace "usual" baseline.
export const TRAILING_MONTHS = 3;

// Spending-pace rows always span 1-31 so the sheet layout is stable across
// months; days that don't exist in the current month evaluate to "" (blank),
// filtered out by the reader in 3_stats.ts.
export const PACE_DAYS = 31;

const IO_SHEET = `'INCOMING/OUTGOING'`;

/** Fixed anchor rows — see the module doc comment for the layout diagram. */
export const STATS_ROWS = {
  title: 1,
  categoryHeader: 2,
  categoryFirst: 3,
  categoryLast: 2 + STATS_CATEGORIES.length,
  paceSeparator: 3 + STATS_CATEGORIES.length,
  paceHeader: 4 + STATS_CATEGORIES.length,
  paceFirst: 5 + STATS_CATEGORIES.length,
  paceLast: 4 + STATS_CATEGORIES.length + PACE_DAYS,
} as const;

/**
 * Builds the three formula cells (incoming, outgoing, net) for one Category
 * row of the "this calendar month" net-change table. `row` is the 1-indexed
 * sheet row the category's own name lives in (column A), so the formulas can
 * reference `$A{row}` instead of hardcoding the category string twice.
 */
export function categoryMonthChangeFormulas(row: number): { incoming: string; outgoing: string; net: string } {
  const boundsThisMonth =
    `${IO_SHEET}!$B:$B,">="&EOMONTH(TODAY(),-1)+1,${IO_SHEET}!$B:$B,"<="&EOMONTH(TODAY(),0)`;
  const incoming =
    `=SUMIFS(${IO_SHEET}!$G:$G,${IO_SHEET}!$F:$F,"I",${IO_SHEET}!$D:$D,$A${row},${boundsThisMonth})`;
  const outgoing =
    `=SUMIFS(${IO_SHEET}!$G:$G,${IO_SHEET}!$F:$F,"O",${IO_SHEET}!$D:$D,$A${row},${boundsThisMonth})`;
  const net = `=B${row}-C${row}`;
  return { incoming, outgoing, net };
}

/**
 * Builds the two formula cells (this-month cumulative, trailing-average
 * cumulative) for one day-of-month row of the spending-pace table. `row` is
 * the 1-indexed sheet row the day number lives in (column A).
 */
export function spendingPaceFormulas(row: number): { thisMonth: string; usual: string } {
  const dayGuard = `$A${row}>DAY(EOMONTH(TODAY(),0))`;

  const thisMonth =
    `=IF(${dayGuard},"",SUMIFS(${IO_SHEET}!$G:$G,${IO_SHEET}!$F:$F,"O",` +
    `${IO_SHEET}!$B:$B,">="&EOMONTH(TODAY(),-1)+1,` +
    `${IO_SHEET}!$B:$B,"<="&MIN(EOMONTH(TODAY(),-1)+$A${row},TODAY())))`;

  const monthTerms: string[] = [];
  for (let m = 1; m <= TRAILING_MONTHS; m++) {
    monthTerms.push(
      `SUMIFS(${IO_SHEET}!$G:$G,${IO_SHEET}!$F:$F,"O",` +
        `${IO_SHEET}!$B:$B,">="&EOMONTH(TODAY(),-${m})+1,` +
        `${IO_SHEET}!$B:$B,"<="&MIN(EOMONTH(TODAY(),-${m})+$A${row},EOMONTH(TODAY(),-${m - 1})))`
    );
  }
  const usual = `=IF(${dayGuard},"",IFERROR(AVERAGE(${monthTerms.join(",")}),0))`;

  return { thisMonth, usual };
}

/**
 * Creates the STATS sheet and seeds it with the fixed layout + formulas when
 * it doesn't already exist. No-op when the sheet is already present — GAS
 * never rewrites STATS cells after creation (they're live formulas; editing
 * them again would just re-insert the same text).
 *
 * Takes `ss` as a parameter (dependency injection) so this pure function can
 * be unit-tested with a fake spreadsheet without touching SpreadsheetApp,
 * mirroring `ensureConfigSheet` (lib/config.ts).
 */
export function ensureStatsSheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  if (ss.getSheetByName(STATS_SHEET_NAME)) return;
  const sheet = ss.insertSheet(STATS_SHEET_NAME);

  sheet.appendRow(["STATS", "", "", ""]);
  sheet.appendRow(["CATEGORY", "INCOMING (MTD)", "OUTGOING (MTD)", "NET CHANGE (MTD)"]);

  STATS_CATEGORIES.forEach((category, i) => {
    const row = STATS_ROWS.categoryFirst + i;
    const { incoming, outgoing, net } = categoryMonthChangeFormulas(row);
    sheet.appendRow([category, incoming, outgoing, net]);
  });

  sheet.appendRow(["", "", "", ""]);
  sheet.appendRow(["DAY", "CUMULATIVE OUTGOING (THIS MONTH)", "CUMULATIVE OUTGOING (USUAL)"]);

  for (let day = 1; day <= PACE_DAYS; day++) {
    const row = STATS_ROWS.paceFirst + day - 1;
    const { thisMonth, usual } = spendingPaceFormulas(row);
    sheet.appendRow([day, thisMonth, usual]);
  }
}
