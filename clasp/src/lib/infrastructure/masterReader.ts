import { parseMasterRows, type MasterRow } from "./master";
import { rangeWidth, SHEET_LAYOUT } from "./sheetLayout";
import { getMasterSheet } from "./sheets";

export function getMaster(): MasterRow {
  const sh = getMasterSheet();
  if (sh.getLastRow() < SHEET_LAYOUT.master.rows.data) return { onHand: 0, budgets: {} };

  // MASTER sheet: row 2 = headers, row 3 = single formula row (never use getLastRow()
  // for data — extra formula rows below would push it past the real data row)
  const headerRow = sh.getRange(
    SHEET_LAYOUT.master.rows.header,
    SHEET_LAYOUT.master.columns.first,
    1,
    rangeWidth(SHEET_LAYOUT.master.columns.first, sh.getLastColumn()),
  ).getValues()[0];
  const dataRow = sh.getRange(
    SHEET_LAYOUT.master.rows.data,
    SHEET_LAYOUT.master.columns.first,
    1,
    rangeWidth(SHEET_LAYOUT.master.columns.first, sh.getLastColumn()),
  ).getValues()[0];

  return parseMasterRows(headerRow, dataRow);
}
