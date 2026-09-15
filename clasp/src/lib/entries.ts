/**
 * entries.ts — Pure helpers for Entry-ID resolution.
 *
 * These functions contain no SpreadsheetApp / GAS calls so they can be
 * unit-tested locally with vitest.  The GAS-facing mutation functions in
 * 2_entries.ts call these helpers after acquiring the DocumentLock.
 */

export { findRowByEntryId } from "./repository";

/**
 * Scans the raw values from the Entry-ID column (col H, row 2 onward) and
 * returns the 1-based sheet row index where the target Entry lives, or null
 * if not found.
 *
 * Row mapping starts at `SHEET_LAYOUT.io.rows.dataFirst`.
 *
 * @param idColumnValues  The array of raw cell values from col H (row 2+).
 *                        Blank cells (separator rows) have `""` as value.
 *                        GAS may return numeric IDs as numbers or strings.
 * @param targetId        The Entry ID to find (positive integer).
 * @returns               The 1-based sheet row index, or null if not found.
 */
