/**
 * repository.ts — the single INCOMING/OUTGOING repository port.
 *
 * Owns the column map, the separator-row predicate, the port interface,
 * and pure glue functions that operate against an injected IoRepository.
 * Contains no SpreadsheetApp calls so it can be unit-tested with a fake.
 * The GAS-facing live adapter lives in 1_sheets.ts (liveIoRepository).
 */

import { findRowByEntryId } from "./entries";
import { findInsertionIndex } from "./weeks";
import type { Direction, EntryData, AddEntryPayload, UpdateEntryPatch } from "./dispatch";

// 1-based sheet columns for INCOMING/OUTGOING — the single column map.
export const IO_COL = {
  DATE: 2,
  TAG: 3,
  MAIN_CAT: 4,
  DESC: 5,
  DIR: 6,
  AMOUNT: 7,
  ID: 8,
} as const;

// A data row as returned by readRows(): cols B–H →
// [date, tag, mainCategory, description, direction, amount, id]
export type IoRow = unknown[];

// col H position within the 0-based B–H slice returned by readRows()
export const ID_INDEX = 6;

/**
 * THE separator predicate: a row with a blank Entry ID (col H) is a week
 * separator, not an Entry. Single named home for this domain rule.
 */
export function isSeparatorRow(idCell: unknown): boolean {
  return idCell === "" || idCell === null || idCell === undefined;
}

export interface EntryFields {
  date: string;
  tag: string;
  description: string;
  direction: Direction;
  amount: number;
  id: number;
}

// Maps EntryFields keys to their 1-based sheet column, in column order.
// Col D (MAIN_CAT) is never a key here — it is ARRAYFORMULA-driven and must
// never be written, so it's naturally excluded from any run.
const FIELD_COLUMNS: [keyof EntryFields, number][] = [
  ["date", IO_COL.DATE],
  ["tag", IO_COL.TAG],
  ["description", IO_COL.DESC],
  ["direction", IO_COL.DIR],
  ["amount", IO_COL.AMOUNT],
  ["id", IO_COL.ID],
];

/**
 * Groups whichever `fields` are present into maximal consecutive-column runs,
 * so the live adapter can write each run with a single `setValues()` call
 * instead of one `setValue()` per field — a failure partway through
 * `writeEntryFields` can no longer leave a row half-written (see docs/adr/0009).
 */
export function planFieldWrites(
  fields: Partial<EntryFields>
): { startCol: number; values: unknown[] }[] {
  const runs: { startCol: number; values: unknown[] }[] = [];
  let current: { startCol: number; values: unknown[] } | null = null;
  let lastCol = -Infinity;

  for (const [key, col] of FIELD_COLUMNS) {
    if (fields[key] === undefined) continue;
    if (current && col === lastCol + 1) {
      current.values.push(fields[key]);
    } else {
      current = { startCol: col, values: [fields[key]] };
      runs.push(current);
    }
    lastCol = col;
  }

  return runs;
}

/** The repository port — small enough to fake. Never writes col D (MAIN_CAT, formula-driven). */
export interface IoRepository {
  /** The single "read all data rows" operation. */
  readRows(): IoRow[];
  /** Writes only the provided fields to the given 1-based sheet row. */
  writeEntryFields(sheetRow: number, fields: Partial<EntryFields>): void;
  /** Deletes the given 1-based sheet row entirely. */
  deleteRow(sheetRow: number): void;
  /** Inserts a blank row before the given 1-based sheet row, shifting rows down. */
  insertRowBefore(sheetRow: number): void;
  /** Flushes pending writes and reads back the formula-driven Main Category (col D). */
  resolveMainCategory(sheetRow: number): string;
}

/** Reads all Entries (skipping separator rows), formatting each row's date via `formatDate`. */
export function listEntries(
  repo: Pick<IoRepository, "readRows">,
  formatDate: (raw: unknown) => string
): EntryData[] {
  const entries: EntryData[] = [];
  for (const row of repo.readRows()) {
    const id = row[ID_INDEX];
    if (isSeparatorRow(id)) continue;
    entries.push({
      id: Number(id),
      date: formatDate(row[0]),
      tag: String(row[1]),
      mainCategory: String(row[2]),
      description: String(row[3]),
      direction: String(row[4]) as Direction,
      amount: Number(row[5]) || 0,
    });
  }
  return entries;
}

/** Patches the Entry matching `id` with the given fields. Throws if not found. */
export function patchEntry(
  repo: Pick<IoRepository, "readRows" | "writeEntryFields">,
  id: number,
  patch: UpdateEntryPatch
): void {
  const rows = repo.readRows();
  const targetRow = findRowByEntryId(rows.map((r) => r[ID_INDEX]), id);
  if (targetRow === null) throw new Error(`Entry ${id} not found`);
  repo.writeEntryFields(targetRow, patch);
}

/**
 * Inserts a new Entry in date order and returns it, with `mainCategory`
 * resolved from the sheet's formula-driven column D. Performs exactly one
 * `readRows()` call regardless of sheet size.
 */
export function insertEntry(repo: IoRepository, payload: AddEntryPayload): EntryData {
  const rows = repo.readRows();

  const existingIds = rows.map((r) => r[ID_INDEX]).filter((id) => !isSeparatorRow(id)).map(Number);
  let nextId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
  const idSet = new Set(existingIds);
  while (idSet.has(nextId)) nextId++;

  const dates: (Date | null)[] = rows.map((r) => {
    const v = r[0];
    return v instanceof Date ? v : v ? new Date(String(v)) : null;
  });
  const newDate = new Date(payload.date);
  const idx = findInsertionIndex(dates, newDate);
  const sheetRow = 2 + idx;
  const lastRow = rows.length + 1;

  let targetRow: number;
  if (sheetRow <= lastRow) {
    repo.insertRowBefore(sheetRow);
    targetRow = sheetRow;
  } else {
    targetRow = lastRow + 1;
  }

  repo.writeEntryFields(targetRow, {
    date: payload.date,
    tag: payload.tag,
    description: payload.description,
    direction: payload.direction,
    amount: payload.amount,
    id: nextId,
  });

  const mainCategory = repo.resolveMainCategory(targetRow);

  return {
    id: nextId,
    date: payload.date,
    tag: payload.tag,
    mainCategory,
    description: payload.description,
    direction: payload.direction,
    amount: payload.amount,
  };
}

/**
 * Inserts N new Entries in array order under a single `readRows()` call.
 * IDs are assigned as a contiguous block starting after the max existing ID,
 * in array order (leg 0 gets the lowest ID). Each leg's row position is
 * computed date-ordered against the sheet state as it stands after the
 * previous legs in this batch were inserted, so legs sharing a date land on
 * adjacent rows in array order and interleave correctly with existing rows.
 */
export function insertEntries(repo: IoRepository, payloads: AddEntryPayload[]): EntryData[] {
  const rows = repo.readRows();

  const existingIds = rows.map((r) => r[ID_INDEX]).filter((id) => !isSeparatorRow(id)).map(Number);
  let nextId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
  const idSet = new Set(existingIds);
  while (idSet.has(nextId)) nextId++;

  const dates: (Date | null)[] = rows.map((r) => {
    const v = r[0];
    return v instanceof Date ? v : v ? new Date(String(v)) : null;
  });

  let lastRow = rows.length + 1;
  const targetRows: number[] = [];
  const entries: EntryData[] = [];

  for (const payload of payloads) {
    const newDate = new Date(payload.date);
    const idx = findInsertionIndex(dates, newDate);
    const sheetRow = 2 + idx;

    let targetRow: number;
    if (sheetRow <= lastRow) {
      repo.insertRowBefore(sheetRow);
      targetRow = sheetRow;
      dates.splice(idx, 0, newDate);
    } else {
      targetRow = lastRow + 1;
      dates.push(newDate);
    }
    lastRow++;

    const id = nextId++;
    repo.writeEntryFields(targetRow, {
      date: payload.date,
      tag: payload.tag,
      description: payload.description,
      direction: payload.direction,
      amount: payload.amount,
      id,
    });

    targetRows.push(targetRow);
    entries.push({
      id,
      date: payload.date,
      tag: payload.tag,
      mainCategory: "",
      description: payload.description,
      direction: payload.direction,
      amount: payload.amount,
    });
  }

  targetRows.forEach((sheetRow, i) => {
    entries[i].mainCategory = repo.resolveMainCategory(sheetRow);
  });

  return entries;
}

/** Deletes the Entry matching `id`. Throws if not found. */
export function removeEntry(repo: Pick<IoRepository, "readRows" | "deleteRow">, id: number): void {
  const rows = repo.readRows();
  const targetRow = findRowByEntryId(rows.map((r) => r[ID_INDEX]), id);
  if (targetRow === null) throw new Error(`Entry ${id} not found`);
  repo.deleteRow(targetRow);
}
