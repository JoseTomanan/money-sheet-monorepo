import { planFieldWrites, type IoRepository, type IoRow } from "./entryRepository";
import { reserveEntryIdBlock } from "./entryIdAllocator";
import { rangeWidth, SHEET_LAYOUT } from "./sheetLayout";

export function getIOSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_LAYOUT.io.name);
  if (!sh) throw new Error(`Sheet not found: ${SHEET_LAYOUT.io.name}`);
  return sh;
}

export function getMasterSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_LAYOUT.master.name);
  if (!sh) throw new Error(`Sheet not found: ${SHEET_LAYOUT.master.name}`);
  return sh;
}

export function getCategoriesSheet(): GoogleAppsScript.Spreadsheet.Sheet {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_LAYOUT.categories.name);
  if (!sh) throw new Error(`Sheet not found: ${SHEET_LAYOUT.categories.name}`);
  return sh;
}

// Tolerant: returns null if the Config sheet doesn't exist (legacy spreadsheets).
export function getConfigSheetOrNull(): GoogleAppsScript.Spreadsheet.Sheet | null {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_LAYOUT.config.name);
}

// Tolerant: returns null if the STATS sheet doesn't exist in a legacy
// spreadsheet created before docs/adr/0011. GAS never writes to STATS — see
// stats.ts for the formula-driven layout.
export function getStatsSheetOrNull(): GoogleAppsScript.Spreadsheet.Sheet | null {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_LAYOUT.stats.name);
}

/** Grow only at the bottom: never move or delete the sheet-owned D2 anchor. */
function ensureIoRowCapacity(sh: GoogleAppsScript.Spreadsheet.Sheet, sheetRow: number): void {
  const maxRows = sh.getMaxRows();
  if (sheetRow > maxRows) sh.insertRowsAfter(maxRows, sheetRow - maxRows);
}

/** The two GAS-owned bands; column D is excluded from copies and clears too. */
function managedIoRanges(sh: GoogleAppsScript.Spreadsheet.Sheet, row: number, count: number) {
  const columns = SHEET_LAYOUT.io.columns;
  return [
    sh.getRange(row, columns.date, count, rangeWidth(columns.date, columns.tag)),
    sh.getRange(row, columns.description, count, rangeWidth(columns.description, columns.mutationId)),
  ];
}

function copyManagedIoRows(sh: GoogleAppsScript.Spreadsheet.Sheet, source: number, destination: number, count: number): void {
  if (count <= 0) return;
  const sources = managedIoRanges(sh, source, count);
  const destinations = managedIoRanges(sh, destination, count);
  sources.forEach((range, index) => range.copyTo(destinations[index]));
}

// The live GAS-backed IoRepository adapter. Defaults to the INCOMING/OUTGOING
// sheet, but accepts an explicit handle so callers (e.g. visibility) that
// already hold one don't re-resolve it.
export function liveIoRepository(
  sh: GoogleAppsScript.Spreadsheet.Sheet = getIOSheet()
): IoRepository {
  return {
    readRows(): IoRow[] {
      const lastRow = sh.getLastRow();
      const firstRow = SHEET_LAYOUT.io.rows.dataFirst;
      if (lastRow < firstRow) return [];
      const rows = sh.getRange(
        firstRow,
        SHEET_LAYOUT.io.columns.date,
        lastRow - firstRow + 1,
        rangeWidth(SHEET_LAYOUT.io.columns.date, SHEET_LAYOUT.io.columns.mutationId),
      ).getValues();
      // D2 exists even in an empty log. It must not turn an otherwise empty
      // row into a separator or force the first Entry to start at row 3.
      const mainCategoryIndex = SHEET_LAYOUT.io.columns.mainCategory - SHEET_LAYOUT.io.columns.date;
      while (rows.length && rows[rows.length - 1].every((value, index) =>
        index === mainCategoryIndex || value === "" || value === null,
      )) rows.pop();
      return rows;
    },
    reserveEntryIds(existingIds: number[], count: number): number {
      return reserveEntryIdBlock(
        PropertiesService.getScriptProperties(),
        sh.getParent().getId(),
        existingIds,
        count,
      );
    },
    insertRowBefore(sheetRow: number): void {
      const lastRow = sh.getLastRow();
      ensureIoRowCapacity(sh, lastRow + 1);
      // Copy rather than insertCells/moveTo: structural shifts can also rewrite
      // the ARRAYFORMULA's C2:C references even when D itself is excluded.
      copyManagedIoRows(sh, sheetRow, sheetRow + 1, lastRow - sheetRow + 1);
      managedIoRanges(sh, sheetRow, 1).forEach((range) => range.clearContent());
    },
    writeEntryFields(sheetRow, fields): void {
      ensureIoRowCapacity(sh, sheetRow);
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
      const lastRow = sh.getLastRow();
      copyManagedIoRows(sh, sheetRow + 1, sheetRow, lastRow - sheetRow);
      managedIoRanges(sh, lastRow, 1).forEach((range) => range.clearContent());
    },
  };
}

/** Adds the idempotency-key column on a migration/setup run; historical rows stay blank. */
export function ensureMutationIdColumn(): void {
  getIOSheet()
    .getRange(SHEET_LAYOUT.io.rows.header, SHEET_LAYOUT.io.columns.mutationId)
    .setValue("MUTATION ID");
}
