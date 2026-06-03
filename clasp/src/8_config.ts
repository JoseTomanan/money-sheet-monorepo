function getConfig(): ConfigMap {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_CONFIG);
  // Tolerant: returns {} if Config sheet doesn't exist (legacy spreadsheets).
  // The frontend falls back to "₱" when the currency key is absent.
  if (!sh) return {};
  const lastRow = sh.getLastRow();
  if (lastRow < 1) return {};
  const rows = sh.getRange(1, 1, lastRow, 2).getValues();
  return parseConfigRows(rows);
}
