const SHEET_IO = "INCOMING/OUTGOING";
const SHEET_MASTER = "MASTER";
const SHEET_CATEGORIES = "Categories";
const SHEET_CONFIG = "Config";

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
