import type { ConfigMap } from "../application/dispatch";
import { parseConfigRows } from "./config";
import { rangeWidth, SHEET_LAYOUT } from "./sheetLayout";
import { getConfigSheetOrNull } from "./sheets";

export function getConfig(): ConfigMap {
  // Tolerant: returns {} if Config sheet doesn't exist (legacy spreadsheets).
  // The frontend falls back to "₱" when the currency key is absent.
  const sh = getConfigSheetOrNull();
  if (!sh) return {};
  const lastRow = sh.getLastRow();
  const firstRow = SHEET_LAYOUT.config.rows.dataFirst;
  const firstColumn = SHEET_LAYOUT.config.columns.key;
  if (lastRow < firstRow) return {};
  const rows = sh.getRange(
    firstRow,
    firstColumn,
    lastRow - firstRow + 1,
    rangeWidth(firstColumn, SHEET_LAYOUT.config.columns.value),
  ).getValues();
  return parseConfigRows(rows);
}
