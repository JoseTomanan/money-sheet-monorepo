/**
 * repository.ts — the single INCOMING/OUTGOING repository port.
 *
 * Uses the shared layout contract and owns the separator-row predicate and port interface,
 * and pure glue functions that operate against an injected IoRepository.
 * Contains no SpreadsheetApp calls so it can be unit-tested with a fake.
 * The GAS-facing live adapter lives in 1_sheets.ts (liveIoRepository).
 */

import { findInsertionIndex } from "./domain/calendar";
import { columnIndexWithinRange, SHEET_LAYOUT } from "./0_sheetLayout";
import type { Direction, Entry as EntryData } from "./domain/entry";
import type { AddEntryPayload, UpdateEntryPatch } from "./application/dispatch";

// Coordinates live in SHEET_LAYOUT; this module derives returned-row positions.

// A data row as returned by readRows(): cols B–I →
// [date, tag, mainCategory, description, direction, amount, id, mutationId]
export type IoRow = unknown[];

function ioValue(row: IoRow, column: number): unknown {
  return row[columnIndexWithinRange(column, SHEET_LAYOUT.io.columns.date)];
}

export function findRowByEntryId(
  idColumnValues: unknown[],
  targetId: number,
): number | null {
  for (let i = 0; i < idColumnValues.length; i++) {
    const raw = idColumnValues[i];
    if (isSeparatorRow(raw)) continue;
    if (Number(raw) === targetId) return i + SHEET_LAYOUT.io.rows.dataFirst;
  }
  return null;
}

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
  mutationId?: string;
}

// Maps EntryFields keys to their 1-based sheet column, in column order.
// Col D (MAIN_CAT) is never a key here — it is ARRAYFORMULA-driven and must
// never be written, so it's naturally excluded from any run.
const FIELD_COLUMNS: [keyof EntryFields, number][] = [
  ["date", SHEET_LAYOUT.io.columns.date],
  ["tag", SHEET_LAYOUT.io.columns.tag],
  ["description", SHEET_LAYOUT.io.columns.description],
  ["direction", SHEET_LAYOUT.io.columns.direction],
  ["amount", SHEET_LAYOUT.io.columns.amount],
  ["id", SHEET_LAYOUT.io.columns.entryId],
  ["mutationId", SHEET_LAYOUT.io.columns.mutationId],
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

/**
 * Reads all Entries (skipping separator rows), formatting each row's date via
 * `formatDate`. Each entry is stamped with its true 1-based sheet row — data
 * rows start at row 2, and separator rows still consume a row number even
 * though they're skipped, so later entries' numbering isn't shifted.
 */
export function listEntries(
  repo: Pick<IoRepository, "readRows">,
  formatDate: (raw: unknown) => string
): EntryData[] {
  const rows = repo.readRows();
  const entries: EntryData[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const id = ioValue(row, SHEET_LAYOUT.io.columns.entryId);
    if (isSeparatorRow(id)) continue;
    entries.push({
      id: Number(id),
      date: formatDate(ioValue(row, SHEET_LAYOUT.io.columns.date)),
      tag: String(ioValue(row, SHEET_LAYOUT.io.columns.tag)),
      mainCategory: String(ioValue(row, SHEET_LAYOUT.io.columns.mainCategory)),
      description: String(ioValue(row, SHEET_LAYOUT.io.columns.description)),
      direction: String(ioValue(row, SHEET_LAYOUT.io.columns.direction)) as Direction,
      amount: Number(ioValue(row, SHEET_LAYOUT.io.columns.amount)) || 0,
      row: SHEET_LAYOUT.io.rows.dataFirst + i,
    });
  }
  return entries;
}

/**
 * Returns the original response order for an add operation: batch Entry IDs
 * are assigned in request-array order, even when their rows are date-sorted.
 */
export function findEntriesByMutationId(
  rows: IoRow[],
  mutationId: string,
  formatDate: (raw: unknown) => string,
): EntryData[] {
  const matchingRows = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) =>
      ioValue(row, SHEET_LAYOUT.io.columns.mutationId) === mutationId
      && !isSeparatorRow(ioValue(row, SHEET_LAYOUT.io.columns.entryId))
    );

  return matchingRows
    .map(({ row, index }) => ({
      id: Number(ioValue(row, SHEET_LAYOUT.io.columns.entryId)),
      date: formatDate(ioValue(row, SHEET_LAYOUT.io.columns.date)),
      tag: String(ioValue(row, SHEET_LAYOUT.io.columns.tag)),
      mainCategory: String(ioValue(row, SHEET_LAYOUT.io.columns.mainCategory)),
      description: String(ioValue(row, SHEET_LAYOUT.io.columns.description)),
      direction: String(ioValue(row, SHEET_LAYOUT.io.columns.direction)) as Direction,
      amount: Number(ioValue(row, SHEET_LAYOUT.io.columns.amount)) || 0,
      row: SHEET_LAYOUT.io.rows.dataFirst + index,
    }))
    .sort((a, b) => a.id - b.id);
}

/** The stored representation must exactly match the immutable add request. */
export function payloadsMatch(entries: EntryData[], payloads: AddEntryPayload[]): boolean {
  return entries.length === payloads.length && entries.every((entry, i) => {
    const payload = payloads[i];
    return entry.date === payload.date
      && entry.tag === payload.tag
      && entry.description === payload.description
      && entry.direction === payload.direction
      && entry.amount === payload.amount;
  });
}

/**
 * Patches the Entry matching `id` with the given fields. A real calendar-date
 * change moves that same Entry into chronological order, after the destination
 * date's existing Entries. The caller holds the document lock for this entire
 * read-modify-write operation.
 */
export function patchEntry(
  repo: Pick<IoRepository, "readRows" | "writeEntryFields" | "deleteRow" | "insertRowBefore">,
  id: number,
  patch: UpdateEntryPatch,
  formatDate: (raw: unknown) => string,
): void {
  const rows = repo.readRows();
  const targetRow = findRowByEntryId(
    rows.map((row) => ioValue(row, SHEET_LAYOUT.io.columns.entryId)),
    id,
  );
  if (targetRow === null) throw new Error(`Entry ${id} not found`);

  const targetIndex = targetRow - SHEET_LAYOUT.io.rows.dataFirst;
  const target = rows[targetIndex];
  if (patch.date === undefined || patch.date === formatDate(ioValue(target, SHEET_LAYOUT.io.columns.date))) {
    repo.writeEntryFields(targetRow, patch);
    return;
  }

  // Remove the source row from the snapshot before finding its destination:
  // otherwise moving an Entry later could incorrectly count itself as a
  // same-date row. Separator rows remain in the snapshot and are never
  // selected or written because their blank ID cannot match `id`.
  const rowsWithoutTarget = rows.filter((_, index) => index !== targetIndex);
  const dates = rowsWithoutTarget.map((row) => {
    const value = ioValue(row, SHEET_LAYOUT.io.columns.date);
    return value instanceof Date ? value : value ? new Date(String(value)) : null;
  });
  const destinationIndex = findInsertionIndex(dates, new Date(patch.date));
  const destinationRow = SHEET_LAYOUT.io.rows.dataFirst + destinationIndex;
  const lastRowAfterDelete = rowsWithoutTarget.length + SHEET_LAYOUT.io.rows.dataFirst - 1;

  // Preserve every stored value except formula-driven Main Category (col D),
  // which must never be written by GAS. Entry ID and Mutation ID move intact.
  const fields: EntryFields = {
    date: patch.date,
    tag: patch.tag ?? String(ioValue(target, SHEET_LAYOUT.io.columns.tag)),
    description: patch.description ?? String(ioValue(target, SHEET_LAYOUT.io.columns.description)),
    direction: patch.direction ?? (String(ioValue(target, SHEET_LAYOUT.io.columns.direction)) as Direction),
    amount: patch.amount ?? Number(ioValue(target, SHEET_LAYOUT.io.columns.amount)),
    id: Number(ioValue(target, SHEET_LAYOUT.io.columns.entryId)),
    mutationId: ioValue(target, SHEET_LAYOUT.io.columns.mutationId) == null
      ? ""
      : String(ioValue(target, SHEET_LAYOUT.io.columns.mutationId)),
  };

  repo.deleteRow(targetRow);
  const writeRow = destinationRow <= lastRowAfterDelete
    ? destinationRow
    : lastRowAfterDelete + 1;
  if (destinationRow <= lastRowAfterDelete) repo.insertRowBefore(destinationRow);
  repo.writeEntryFields(writeRow, fields);
}

/**
 * Inserts a new Entry in date order and returns it, with `mainCategory`
 * resolved from the sheet's formula-driven column D. Performs exactly one
 * `readRows()` call regardless of sheet size.
 */
export function insertEntry(
  repo: IoRepository,
  payload: AddEntryPayload,
  mutationId?: string,
  rows: IoRow[] = repo.readRows(),
): EntryData {

  const existingIds = rows
    .map((row) => ioValue(row, SHEET_LAYOUT.io.columns.entryId))
    .filter((id) => !isSeparatorRow(id))
    .map(Number);
  let nextId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
  const idSet = new Set(existingIds);
  while (idSet.has(nextId)) nextId++;

  const dates: (Date | null)[] = rows.map((r) => {
    const v = ioValue(r, SHEET_LAYOUT.io.columns.date);
    return v instanceof Date ? v : v ? new Date(String(v)) : null;
  });
  const newDate = new Date(payload.date);
  const idx = findInsertionIndex(dates, newDate);
  const sheetRow = SHEET_LAYOUT.io.rows.dataFirst + idx;
  const lastRow = rows.length + SHEET_LAYOUT.io.rows.dataFirst - 1;

  let targetRow: number;
  if (sheetRow <= lastRow) {
    repo.insertRowBefore(sheetRow);
    targetRow = sheetRow;
  } else {
    targetRow = lastRow + 1;
  }

  const fields: EntryFields = {
    date: payload.date,
    tag: payload.tag,
    description: payload.description,
    direction: payload.direction,
    amount: payload.amount,
    id: nextId,
    mutationId: mutationId ?? "",
  };
  if (!mutationId) delete fields.mutationId;
  repo.writeEntryFields(targetRow, fields);

  const mainCategory = repo.resolveMainCategory(targetRow);

  return {
    id: nextId,
    date: payload.date,
    tag: payload.tag,
    mainCategory,
    description: payload.description,
    direction: payload.direction,
    amount: payload.amount,
    row: targetRow,
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
export function insertEntries(
  repo: IoRepository,
  payloads: AddEntryPayload[],
  mutationId?: string,
  rows: IoRow[] = repo.readRows(),
): EntryData[] {

  const existingIds = rows
    .map((row) => ioValue(row, SHEET_LAYOUT.io.columns.entryId))
    .filter((id) => !isSeparatorRow(id))
    .map(Number);
  let nextId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
  const idSet = new Set(existingIds);
  while (idSet.has(nextId)) nextId++;

  const dates: (Date | null)[] = rows.map((r) => {
    const v = ioValue(r, SHEET_LAYOUT.io.columns.date);
    return v instanceof Date ? v : v ? new Date(String(v)) : null;
  });

  let lastRow = rows.length + SHEET_LAYOUT.io.rows.dataFirst - 1;
  const targetRows: number[] = [];
  const entries: EntryData[] = [];

  for (const payload of payloads) {
    const newDate = new Date(payload.date);
    const idx = findInsertionIndex(dates, newDate);
    const sheetRow = SHEET_LAYOUT.io.rows.dataFirst + idx;

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
    const fields: EntryFields = {
      date: payload.date,
      tag: payload.tag,
      description: payload.description,
      direction: payload.direction,
      amount: payload.amount,
      id,
      mutationId: mutationId ?? "",
    };
    if (!mutationId) delete fields.mutationId;
    repo.writeEntryFields(targetRow, fields);

    targetRows.push(targetRow);
    entries.push({
      id,
      date: payload.date,
      tag: payload.tag,
      mainCategory: "",
      description: payload.description,
      direction: payload.direction,
      amount: payload.amount,
      row: targetRow,
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
  const targetRow = findRowByEntryId(
    rows.map((row) => ioValue(row, SHEET_LAYOUT.io.columns.entryId)),
    id,
  );
  if (targetRow === null) throw new Error(`Entry ${id} not found`);
  repo.deleteRow(targetRow);
}
