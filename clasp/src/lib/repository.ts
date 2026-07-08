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

/** Deletes the Entry matching `id`. Throws if not found. */
export function removeEntry(repo: Pick<IoRepository, "readRows" | "deleteRow">, id: number): void {
  const rows = repo.readRows();
  const targetRow = findRowByEntryId(rows.map((r) => r[ID_INDEX]), id);
  if (targetRow === null) throw new Error(`Entry ${id} not found`);
  repo.deleteRow(targetRow);
}
