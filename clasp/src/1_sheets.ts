function getIOSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_LAYOUT.io.name);
  if (!sh) throw new Error(`Sheet not found: ${SHEET_LAYOUT.io.name}`);
  return sh;
}

function getMasterSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_LAYOUT.master.name);
  if (!sh) throw new Error(`Sheet not found: ${SHEET_LAYOUT.master.name}`);
  return sh;
}

function getCategoriesSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_LAYOUT.categories.name);
  if (!sh) throw new Error(`Sheet not found: ${SHEET_LAYOUT.categories.name}`);
  return sh;
}

// Tolerant: returns null if the Config sheet doesn't exist (legacy spreadsheets).
function getConfigSheetOrNull(): GoogleAppsScript.Spreadsheet.Sheet | null {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_LAYOUT.config.name);
}

// Tolerant: returns null if the STATS sheet doesn't exist in a legacy
// spreadsheet created before docs/adr/0011. GAS never writes to STATS — see
// lib/stats.ts for the formula-driven layout.
function getStatsSheetOrNull(): GoogleAppsScript.Spreadsheet.Sheet | null {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_LAYOUT.stats.name);
}

// The live GAS-backed IoRepository adapter. Defaults to the INCOMING/OUTGOING
// sheet, but accepts an explicit handle so callers (e.g. visibility) that
// already hold one don't re-resolve it.
function liveIoRepository(
  sh: GoogleAppsScript.Spreadsheet.Sheet = getIOSheet()
): IoRepository {
  return {
    readRows(): IoRow[] {
      const lastRow = sh.getLastRow();
      const firstRow = SHEET_LAYOUT.io.rows.dataFirst;
      if (lastRow < firstRow) return [];
      return sh.getRange(
        firstRow,
        SHEET_LAYOUT.io.columns.date,
        lastRow - firstRow + 1,
        rangeWidth(SHEET_LAYOUT.io.columns.date, SHEET_LAYOUT.io.columns.mutationId),
      ).getValues();
    },
    insertRowBefore(sheetRow: number): void {
      sh.insertRowBefore(sheetRow);
    },
    writeEntryFields(sheetRow, fields): void {
      // Never writes Main Category (col D) — it is ARRAYFORMULA-driven.
      // Each consecutive-column run is written with one setValues() call so a
      // failure partway through can't leave the row half-written (docs/adr/0009).
      for (const run of planFieldWrites(fields)) {
        sh.getRange(sheetRow, run.startCol, 1, run.values.length).setValues([run.values]);
      }
    },
    resolveMainCategory(sheetRow: number): string {
      SpreadsheetApp.flush();
      return String(sh.getRange(sheetRow, SHEET_LAYOUT.io.columns.mainCategory).getValue());
    },
    deleteRow(sheetRow: number): void {
      sh.deleteRow(sheetRow);
    },
  };
}

/** Adds the idempotency-key column on a migration/setup run; historical rows stay blank. */
function ensureMutationIdColumn(): void {
  getIOSheet()
    .getRange(SHEET_LAYOUT.io.rows.header, SHEET_LAYOUT.io.columns.mutationId)
    .setValue("MUTATION ID");
}
