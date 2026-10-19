/**
 * categorySync.ts — propagates a Subcategory rename/delete in the Categories
 * sheet into INCOMING/OUTGOING, so existing entries aren't orphaned (#123
 * gives an orphaned tag a manual recovery path; this trigger keeps most
 * entries from ever needing it). Pure logic only — no SpreadsheetApp /
 * LockService / PropertiesService calls, so it's unit-testable with vitest.
 * Coordinates and row operations live here; application/categorySync.ts owns
 * decisions and recovery. categorySyncGas.ts supplies the GAS services.
 */

import { isSeparatorRow, type IoRow, type IoRepository } from "./entryRepository";
import { columnIndexWithinRange, SHEET_LAYOUT } from "./sheetLayout";
import {
  runCategorySync,
  retryCategorySync,
  type CategorySyncChange,
  type CategorySyncResult,
  type CategorySyncCatalog,
  classifyCategoryChange,
  categoryNameCollision,
} from "../application/categorySync";

// 1-based column of the Categories sheet's Subcategory field. Renames/deletes
// are only ever detected on this column — col C (parent Category) edits are a
// documented no-op, since col D's VLOOKUP re-resolves automatically.
export interface CategoryEditInput {
  isCategoriesSheet: boolean;
  column: number;
  row: number;
  numRows: number;
  numCols: number;
  oldValue: string | undefined;
  value: string | undefined;
}

export type CategoryEditClassification =
  | { kind: "ignore" }
  | { kind: "rename"; oldValue: string; newValue: string }
  | { kind: "delete"; oldValue: string };

export function classifyCategoryEdit(input: CategoryEditInput): CategoryEditClassification {
  return classifyCategoryChange({ ...input, isSubcategoryCell: isSubcategoryCell(input) });
}

// catData rows: [Subcategory, Category]. catData[i] maps from
// SHEET_LAYOUT.categories.rows.dataFirst. Mirrors getCategories()'s own slice
// (categories.ts) so callers can read the Categories sheet once and reuse
// it for both collision-checking and parent-lookup.
export type CategoryRow = [string, string];

/**
 * Resolves the parent Category for `row` (1-based sheet row) by walking
 * catData and tracking the last non-blank col C — the same merged-cell walk
 * getCategories() does, scoped to a single row instead of the whole map.
 */
export function parentCategoryForRow(catData: CategoryRow[], row: number): string | null {
  let currentCategory = "";
  for (
    let i = 0;
    i <= row - SHEET_LAYOUT.categories.rows.dataFirst && i < catData.length;
    i++
  ) {
    const categoryCell = String(
      catData[i][columnIndexWithinRange(
        SHEET_LAYOUT.categories.columns.category,
        SHEET_LAYOUT.categories.columns.subcategory,
      )] ?? "",
    ).trim();
    if (categoryCell !== "") currentCategory = categoryCell;
  }
  return currentCategory !== "" ? currentCategory : null;
}

// Positions in the returned IO row are derived from the shared 1-based layout.
function ioValue(row: IoRow, column: number): unknown {
  return row[columnIndexWithinRange(column, SHEET_LAYOUT.io.columns.date)];
}

// THE match predicate for a bulk retag — an Outgoing, non-separator row whose
// Tag exactly equals oldTag. Single home so the pre-lock count
// (countMatchingOutgoingTags) and the actual write (retagOutgoingRows) can
// never disagree.
function isMatchingOutgoingRow(row: IoRow, oldTag: string): boolean {
  return !isSeparatorRow(ioValue(row, SHEET_LAYOUT.io.columns.entryId))
    && ioValue(row, SHEET_LAYOUT.io.columns.direction) === "O"
    && ioValue(row, SHEET_LAYOUT.io.columns.tag) === oldTag;
}

/** Counts Outgoing rows whose Tag exactly equals oldTag. Skips separators. */
export function countMatchingOutgoingTags(rows: IoRow[], oldTag: string): number {
  return rows.filter((row) => isMatchingOutgoingRow(row, oldTag)).length;
}

export interface NameCollision {
  message: string;
}

/**
 * Guards a rename against colliding with any existing Subcategory name
 * (across all Categories) or a top-level Category name. catData already
 * reflects the post-edit sheet — `row`'s own entry is excluded from the
 * "other Subcategory" set so a rename never collides with itself.
 */
export function findNameCollision(
  newName: string,
  catData: CategoryRow[],
  row: number
): NameCollision | null {
  return categoryNameCollision(newName, categoryCatalog(catData, row));
}

/**
 * Rewrites Tag to newTag on every Outgoing row whose Tag exactly equals
 * oldTag (same matching rule as countMatchingOutgoingTags — pre-lock count
 * and actual write are computed by the same predicate so they can't
 * disagree). Never touches col D (writeEntryFields already excludes it).
 * Returns the number of rows rewritten.
 */
export function retagOutgoingRows(
  repo: Pick<IoRepository, "readRows" | "writeEntryFields">,
  oldTag: string,
  newTag: string
): number {
  const rows = repo.readRows();
  let count = 0;
  rows.forEach((row, i) => {
    if (isMatchingOutgoingRow(row, oldTag)) {
      repo.writeEntryFields(i + SHEET_LAYOUT.io.rows.dataFirst, { tag: newTag });
      count++;
    }
  });
  return count;
}

/**
 * The one stashed pending propagation retried by "Retry last category sync"
 * after lock refusal or interrupted application. Rename and delete both
 * collapse to "retag oldValue -> newTag" (delete's newTag is the resolved
 * parent Category) so retryCategorySync doesn't need to re-derive it.
 */
export type PendingCategorySync = CategorySyncChange;

/** Script Properties only store strings — JSON-encodes the stashed pending propagation. */
export function encodePendingSync(pending: PendingCategorySync): string {
  return JSON.stringify(pending);
}

/** Decodes a stashed pending propagation; null (no stashed property) decodes to null. */
export function decodePendingSync(raw: string | null): PendingCategorySync | null {
  if (raw === null) return null;
  return JSON.parse(raw) as PendingCategorySync;
}

/** Structural subset of GoogleAppsScript.Base.Ui needed for the sync confirmation flow. */
export interface SyncUi {
  alert(prompt: string, buttons?: unknown): unknown;
  Button: { YES: unknown };
  ButtonSet: { YES_NO: unknown };
}

/** Translate merged cells into a semantic catalog; the application decides policy. */
function categoryCatalog(catData: CategoryRow[], row: number): CategorySyncCatalog {
  let parent = "";
  const categories = new Set<string>();
  const otherSubcategories: CategorySyncCatalog["otherSubcategories"] = [];
  catData.forEach((cells, index) => {
    const category = String(cells[columnIndexWithinRange(
      SHEET_LAYOUT.categories.columns.category, SHEET_LAYOUT.categories.columns.subcategory,
    )] ?? "").trim();
    if (category) parent = category;
    if (parent) categories.add(parent);
    if (index !== row - SHEET_LAYOUT.categories.rows.dataFirst) {
      otherSubcategories.push({ name: String(cells[columnIndexWithinRange(
        SHEET_LAYOUT.categories.columns.subcategory, SHEET_LAYOUT.categories.columns.subcategory,
      )] ?? "").trim(), parent });
    }
  });
  return { parentCategory: parentCategoryForRow(catData, row), categories: [...categories], otherSubcategories };
}

function syncPorts(deps: {
  repo: Pick<IoRepository, "readRows" | "writeEntryFields">;
  ui: SyncUi;
  withLock<T>(fn: () => T): T;
}, savePending: (change: PendingCategorySync) => void) {
  return {
    count: (tag: string) => countMatchingOutgoingTags(deps.repo.readRows(), tag),
    confirm: (change: CategorySyncChange, count: number, retry: boolean) => {
      const { oldValue, newTag } = change;
      const prompt = retry ? `Retry syncing "${oldValue}" to "${newTag}"?`
        : change.kind === "rename" ? `Rename "${oldValue}" to "${newTag}"?`
        : `Delete "${oldValue}"? Its entries will be reassigned to "${newTag}".`;
      return deps.ui.alert(`${prompt} This will update ${count} entries.`, deps.ui.ButtonSet.YES_NO) === deps.ui.Button.YES;
    },
    transact: deps.withLock,
    retag: (oldTag: string, replacement: string) => retagOutgoingRows(deps.repo, oldTag, replacement),
    savePending,
  };
}

function reportSyncResult(ui: SyncUi, result: CategorySyncResult): void {
  if (result.status === "blocked") ui.alert(result.message);
  if (result.status === "empty") ui.alert("No pending category sync to retry.");
  if (result.status === "deferred") {
    ui.alert('Could not acquire the document lock. No Tags were changed by this attempt. Use "Retry last category sync".');
  }
  if (result.status === "interrupted") {
    ui.alert('Category sync was interrupted. Some Tags may already have changed. Use "Retry last category sync" to finish the remaining entries.');
  }
}

export interface RunCategorySyncDeps {
  edit: CategoryEditInput;
  getCatData(): CategoryRow[];
  repo: Pick<IoRepository, "readRows" | "writeEntryFields">;
  ui: SyncUi;
  withLock<T>(fn: () => T): T;
  stash(pending: PendingCategorySync): void;
}

function isSubcategoryCell(edit: CategoryEditInput): boolean {
  return edit.isCategoriesSheet
    && edit.column === SHEET_LAYOUT.categories.columns.subcategory
    && edit.row >= SHEET_LAYOUT.categories.rows.dataFirst
    && edit.numRows === 1 && edit.numCols === 1;
}

/** Map sheet coordinates and render the application's outcome. */
export function runCategorySyncSheet(deps: RunCategorySyncDeps): void {
  const edit = deps.edit;
  const result = runCategorySync({
    ...syncPorts(deps, deps.stash),
    edit: {
      isSubcategoryCell: isSubcategoryCell(edit),
      oldValue: edit.oldValue,
      value: edit.value,
    },
    getCatalog: () => categoryCatalog(deps.getCatData(), edit.row),
  });
  reportSyncResult(deps.ui, result);
}

export interface RetryCategorySyncDeps {
  pending: PendingCategorySync | null;
  repo: Pick<IoRepository, "readRows" | "writeEntryFields">;
  ui: SyncUi;
  withLock<T>(fn: () => T): T;
  clearStash(): void;
  restash(pending: PendingCategorySync): void;
}

export function retryCategorySyncSheet(deps: RetryCategorySyncDeps): void {
  reportSyncResult(deps.ui, retryCategorySync({
    ...syncPorts(deps, deps.restash),
    pending: deps.pending,
    clearPending: deps.clearStash,
  }));
}
