/**
 * categorySync.ts — propagates a Subcategory rename/delete in the Categories
 * sheet into INCOMING/OUTGOING, so existing entries aren't orphaned (#123
 * gives an orphaned tag a manual recovery path; this trigger keeps most
 * entries from ever needing it). Pure logic only — no SpreadsheetApp /
 * LockService / PropertiesService calls, so it's unit-testable with vitest.
 * The GAS-facing glue (onEdit binding, trigger install, lock acquisition,
 * property stash) lives in 6_category_sync.ts.
 */

import { isSeparatorRow, ID_INDEX, type IoRow, type IoRepository } from "./repository";

// 1-based column of the Categories sheet's Subcategory field. Renames/deletes
// are only ever detected on this column — col C (parent Category) edits are a
// documented no-op, since col D's VLOOKUP re-resolves automatically.
export const CAT_COL = {
  SUBCATEGORY: 2,
} as const;

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
  const isSingleCell = input.numRows === 1 && input.numCols === 1;
  if (
    !input.isCategoriesSheet ||
    input.column !== CAT_COL.SUBCATEGORY ||
    input.row < 2 ||
    !isSingleCell
  ) {
    return { kind: "ignore" };
  }

  const oldValue = (input.oldValue ?? "").trim();
  const value = (input.value ?? "").trim();

  if (oldValue !== "" && value !== "" && oldValue !== value) {
    return { kind: "rename", oldValue, newValue: value };
  }
  if (oldValue !== "" && value === "") {
    return { kind: "delete", oldValue };
  }
  return { kind: "ignore" };
}

// catData rows: [Subcategory, Category] — catData[0] is sheet row 2, i.e.
// catData[i] is sheet row (i + 2). Mirrors getCategories()'s own slice
// (4_categories.ts) so callers can read the Categories sheet once and reuse
// it for both collision-checking and parent-lookup.
export type CategoryRow = [string, string];

/**
 * Resolves the parent Category for `row` (1-based sheet row) by walking
 * catData and tracking the last non-blank col C — the same merged-cell walk
 * getCategories() does, scoped to a single row instead of the whole map.
 */
export function parentCategoryForRow(catData: CategoryRow[], row: number): string | null {
  let currentCategory = "";
  for (let i = 0; i <= row - 2 && i < catData.length; i++) {
    const categoryCell = String(catData[i][1] ?? "").trim();
    if (categoryCell !== "") currentCategory = categoryCell;
  }
  return currentCategory !== "" ? currentCategory : null;
}

// 0-based positions within the B–H row slice IoRepository.readRows() returns
// ([date, tag, mainCategory, description, direction, amount, id]) — mirrors
// repository.ts's ID_INDEX rather than redefining it.
const TAG_INDEX = 1;
const DIR_INDEX = 4;

// THE match predicate for a bulk retag — an Outgoing, non-separator row whose
// Tag exactly equals oldTag. Single home so the pre-lock count
// (countMatchingOutgoingTags) and the actual write (retagOutgoingRows) can
// never disagree.
function isMatchingOutgoingRow(row: IoRow, oldTag: string): boolean {
  return !isSeparatorRow(row[ID_INDEX]) && row[DIR_INDEX] === "O" && row[TAG_INDEX] === oldTag;
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
  const ownIndex = row - 2;
  let currentCategory = "";
  const categories = new Set<string>();
  let collidingParent: string | null = null;

  for (let i = 0; i < catData.length; i++) {
    const subcategory = String(catData[i][0] ?? "").trim();
    const categoryCell = String(catData[i][1] ?? "").trim();
    if (categoryCell !== "") currentCategory = categoryCell;
    if (currentCategory !== "") categories.add(currentCategory);
    if (i !== ownIndex && subcategory === newName) collidingParent = currentCategory;
  }

  if (categories.has(newName)) {
    return { message: `'${newName}' already exists as a top-level Category — rename aborted` };
  }
  if (collidingParent !== null) {
    return { message: `'${newName}' already exists under ${collidingParent} — rename aborted` };
  }
  return null;
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
      repo.writeEntryFields(i + 2, { tag: newTag });
      count++;
    }
  });
  return count;
}

/**
 * The one stashed pending propagation retried by "Retry last category sync"
 * when the DocumentLock couldn't be acquired in time. Rename and delete both
 * collapse to "retag oldValue -> newTag" (delete's newTag is the resolved
 * parent Category) so retryCategorySync doesn't need to re-derive it.
 */
export interface PendingCategorySync {
  kind: "rename" | "delete";
  oldValue: string;
  newTag: string;
}

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

const LOCK_FAILURE_MESSAGE =
  'Couldn\'t sync right now — it will be retried via "Retry last category sync".';

/**
 * Shared tail of both runCategorySync and retryCategorySync: count affected
 * rows, confirm, and on YES retag under the caller's document lock
 * (ADR-0009). On a lock-acquisition failure, calls onLockFailure to stash
 * the pending propagation instead of partially applying it (issue #126),
 * rather than leaving it applied halfway.
 */
function confirmAndRetag(
  deps: { repo: Pick<IoRepository, "readRows" | "writeEntryFields">; ui: SyncUi; withLock<T>(fn: () => T): T },
  oldValue: string,
  newTag: string,
  confirmPrompt: string,
  onLockFailure: () => void,
  onSuccess?: () => void
): void {
  const rows = deps.repo.readRows();
  const count = countMatchingOutgoingTags(rows, oldValue);

  const response = deps.ui.alert(
    `${confirmPrompt} This will update ${count} entries.`,
    deps.ui.ButtonSet.YES_NO
  );
  if (response !== deps.ui.Button.YES) return;

  try {
    deps.withLock(() => retagOutgoingRows(deps.repo, oldValue, newTag));
    onSuccess?.();
  } catch {
    onLockFailure();
    deps.ui.alert(LOCK_FAILURE_MESSAGE);
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

/**
 * The full onEdit-fired flow: classify -> (rename) collision guard -> confirm
 * -> on YES, retag under the caller's document lock (ADR-0009).
 */
export function runCategorySync(deps: RunCategorySyncDeps): void {
  const classification = classifyCategoryEdit(deps.edit);
  if (classification.kind === "ignore") return;

  const catData = deps.getCatData();
  const oldValue = classification.oldValue;
  let newTag: string;
  let confirmPrompt: string;

  if (classification.kind === "rename") {
    const collision = findNameCollision(classification.newValue, catData, deps.edit.row);
    if (collision) {
      deps.ui.alert(collision.message);
      return;
    }
    newTag = classification.newValue;
    confirmPrompt = `Rename "${oldValue}" to "${newTag}"?`;
  } else {
    newTag = parentCategoryForRow(catData, deps.edit.row) ?? "";
    confirmPrompt = `Delete "${oldValue}"? Its entries will be reassigned to "${newTag}".`;
  }

  confirmAndRetag(deps, oldValue, newTag, confirmPrompt, () =>
    deps.stash({ kind: classification.kind, oldValue, newTag })
  );
}

export interface RetryCategorySyncDeps {
  pending: PendingCategorySync | null;
  repo: Pick<IoRepository, "readRows" | "writeEntryFields">;
  ui: SyncUi;
  withLock<T>(fn: () => T): T;
  clearStash(): void;
  restash(pending: PendingCategorySync): void;
}

/**
 * Re-attempts exactly the one stashed pending propagation — not a general
 * re-diff of the Categories sheet (issue #126 explicitly scopes this to a
 * single retry of the last thing that failed to acquire the lock).
 */
export function retryCategorySync(deps: RetryCategorySyncDeps): void {
  const pending = deps.pending;
  if (pending === null) {
    deps.ui.alert("No pending category sync to retry.");
    return;
  }

  confirmAndRetag(
    deps,
    pending.oldValue,
    pending.newTag,
    `Retry syncing "${pending.oldValue}" to "${pending.newTag}"?`,
    () => deps.restash(pending),
    deps.clearStash
  );
}
