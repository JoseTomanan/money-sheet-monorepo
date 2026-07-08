/**
 * entries.ts — Pure helpers for Entry-ID resolution.
 *
 * These functions contain no SpreadsheetApp / GAS calls so they can be
 * unit-tested locally with vitest.  The GAS-facing mutation functions in
 * 2_entries.ts call these helpers after acquiring the DocumentLock.
 */

import { isSeparatorRow } from "./repository";

/**
 * Scans the raw values from the Entry-ID column (col H, row 2 onward) and
 * returns the 1-based sheet row index where the target Entry lives, or null
 * if not found.
 *
 * Row mapping: `idColumnValues[i]` corresponds to sheet row `i + 2`.
 *
 * @param idColumnValues  The array of raw cell values from col H (row 2+).
 *                        Blank cells (separator rows) have `""` as value.
 *                        GAS may return numeric IDs as numbers or strings.
 * @param targetId        The Entry ID to find (positive integer).
 * @returns               The 1-based sheet row index, or null if not found.
 */
export function findRowByEntryId(
  idColumnValues: unknown[],
  targetId: number
): number | null {
  for (let i = 0; i < idColumnValues.length; i++) {
    const raw = idColumnValues[i];
    if (isSeparatorRow(raw)) continue;
    if (Number(raw) === targetId) {
      return i + 2; // convert 0-based index to 1-based sheet row (data starts at row 2)
    }
  }
  return null;
}
