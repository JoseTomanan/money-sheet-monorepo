import { columnIndexWithinRange, SHEET_LAYOUT } from "./0_sheetLayout";
const DEFAULT_CONFIG_ROWS: [string, string][] = [["currency", "₱"], ["nickname", ""]];

/**
 * Parses a 2-column key-value range from the Config sheet into a plain object.
 * Each row is [key, value]; rows with an empty key (after trimming) are skipped.
 */
export function parseConfigRows(rows: unknown[][]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of rows) {
    const key = String(row[columnIndexWithinRange(
      SHEET_LAYOUT.config.columns.key,
      SHEET_LAYOUT.config.columns.key,
    )] ?? "").trim();
    if (!key) continue;
    result[key] = String(row[columnIndexWithinRange(
      SHEET_LAYOUT.config.columns.value,
      SHEET_LAYOUT.config.columns.key,
    )] ?? "").trim();
  }
  return result;
}

/**
 * Creates the Config sheet and seeds it with default rows when it doesn't
 * already exist. No-op when the sheet is already present.
 *
 * Takes `ss` as a parameter (dependency injection) so this pure function
 * can be unit-tested with a fake spreadsheet without touching SpreadsheetApp.
 */
export function ensureConfigSheet(
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
  defaults: [string, string][] = DEFAULT_CONFIG_ROWS
): void {
  if (ss.getSheetByName(SHEET_LAYOUT.config.name)) return;
  const sheet = ss.insertSheet(SHEET_LAYOUT.config.name);
  for (const row of defaults) {
    sheet.appendRow(row);
  }
}
