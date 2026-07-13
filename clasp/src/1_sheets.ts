const SHEET_IO = "INCOMING/OUTGOING";
const SHEET_MASTER = "MASTER";
const SHEET_CATEGORIES = "Categories";
const SHEET_CONFIG = "Config";
// Literal, not a reference to lib/stats.ts's STATS_SHEET_NAME: dist/lib/*.js
// loads AFTER the numbered top-level files (alphabetically, "lib" > digits),
// so a top-level const initializer here can't safely read a lib-module const
// at load time. Kept equal to STATS_SHEET_NAME by convention; the two are
// small enough (a single string literal) that drift risk is low, same as the
// other SHEET_* consts in this file, none of which reference lib modules.
const SHEET_STATS = "STATS";

function getIOSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_IO);
  if (!sh) throw new Error(`Sheet not found: ${SHEET_IO}`);
  return sh;
}

function getMasterSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_MASTER);
  if (!sh) throw new Error(`Sheet not found: ${SHEET_MASTER}`);
  return sh;
}

function getCategoriesSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_CATEGORIES);
  if (!sh) throw new Error(`Sheet not found: ${SHEET_CATEGORIES}`);
  return sh;
}

// Tolerant: returns null if the Config sheet doesn't exist (legacy spreadsheets).
function getConfigSheetOrNull(): GoogleAppsScript.Spreadsheet.Sheet | null {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_CONFIG);
}

// Tolerant: returns null if the STATS sheet doesn't exist yet (spreadsheets
// created before docs/adr/0011, until they re-run setup()). GAS never writes
// to STATS — see lib/stats.ts for the formula-driven layout.
function getStatsSheetOrNull(): GoogleAppsScript.Spreadsheet.Sheet | null {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_STATS);
}

// The live GAS-backed IoRepository adapter. Defaults to the INCOMING/OUTGOING
// sheet, but accepts an explicit handle so callers (e.g. visibility) that
// already hold one don't re-resolve it.
function liveIoRepository(sh: GoogleAppsScript.Spreadsheet.Sheet = getIOSheet()): IoRepository {
  return {
    readRows(): IoRow[] {
      const lastRow = sh.getLastRow();
      if (lastRow < 2) return [];
      return sh.getRange(2, IO_COL.DATE, lastRow - 1, 7).getValues();
    },
    insertRowBefore(sheetRow: number): void {
      sh.insertRowBefore(sheetRow);
    },
    writeEntryFields(sheetRow, fields): void {
      // Never writes IO_COL.MAIN_CAT (col D) — it is ARRAYFORMULA-driven.
      // Each consecutive-column run is written with one setValues() call so a
      // failure partway through can't leave the row half-written (docs/adr/0009).
      for (const run of planFieldWrites(fields)) {
        sh.getRange(sheetRow, run.startCol, 1, run.values.length).setValues([run.values]);
      }
    },
    resolveMainCategory(sheetRow: number): string {
      SpreadsheetApp.flush();
      return String(sh.getRange(sheetRow, IO_COL.MAIN_CAT).getValue());
    },
    deleteRow(sheetRow: number): void {
      sh.deleteRow(sheetRow);
    },
  };
}
