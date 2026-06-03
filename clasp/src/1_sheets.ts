const SHEET_IO = "INCOMING/OUTGOING";
const SHEET_MASTER = "MASTER";
const SHEET_CATEGORIES = "Categories";
const SHEET_CONFIG = "Config";

// 1-based column indices for INCOMING/OUTGOING
const COL = {
  DATE: 2,
  TAG: 3,
  MAIN_CAT: 4,
  DESC: 5,
  DIR: 6,
  AMOUNT: 7,
  ID: 8,
} as const;

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

// Returns all data rows from INCOMING/OUTGOING (row 2 onward, cols B–H).
// Each inner array: [date, tag, mainCategory, description, direction, amount, id]
function getIODataRows(): unknown[][] {
  const sh = getIOSheet();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  return sh.getRange(2, COL.DATE, lastRow - 1, 7).getValues();
}
