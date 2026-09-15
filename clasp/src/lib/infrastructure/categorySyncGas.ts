/**
 * onEdit trigger for the Categories sheet: detects a Subcategory rename or
 * delete and propagates it into INCOMING/OUTGOING so existing entries
 * aren't orphaned (issue #126, building on #123's bare-Category recovery
 * path). Decision logic lives in infrastructure/categorySync.ts (unit-tested); this
 * file only wires real SpreadsheetApp / LockService / PropertiesService /
 * ScriptApp collaborators into it. Not unit-testable — verify against a
 * real deployment.
 */

import {
  decodePendingSync,
  encodePendingSync,
  retryCategorySync,
  runCategorySync,
  type CategoryRow,
} from "./categorySync";
import type { CategoryEditEventData } from "../application/categorySync";
import { liveIoRepository, getCategoriesSheet } from "./sheets";
import { runExclusive } from "./locking";
import { rangeWidth, SHEET_LAYOUT } from "./sheetLayout";

const PENDING_CATEGORY_SYNC_KEY = "PENDING_CATEGORY_SYNC";

// Same [Subcategory, Category] slice getCategories() reads (categories.ts),
// reused here so the collision check and parent-lookup share one read.
function getCategoryData(): CategoryRow[] {
  const sh = getCategoriesSheet();
  const lastRow = sh.getLastRow();
  const firstRow = SHEET_LAYOUT.categories.rows.dataFirst;
  const firstColumn = SHEET_LAYOUT.categories.columns.subcategory;
  if (lastRow < firstRow) return [];
  return sh.getRange(
    firstRow,
    firstColumn,
    lastRow - firstRow + 1,
    rangeWidth(firstColumn, SHEET_LAYOUT.categories.columns.category),
  ).getValues() as CategoryRow[];
}

function withDocumentLock<T>(fn: () => T): T {
  return runExclusive(LockService.getDocumentLock(), 10_000, fn);
}

/**
 * Installable-trigger target, bound via installCategorySyncTrigger() below —
 * deliberately not named `onEdit` (the reserved simple-trigger name), which
 * would lose LockService/PropertiesService access.
 */
export function applyCategorySyncEdit(edit: CategoryEditEventData): void {
  const props = PropertiesService.getScriptProperties();

  runCategorySync({
    edit: {
      isCategoriesSheet: edit.sheetName === SHEET_LAYOUT.categories.name,
      column: edit.column,
      row: edit.row,
      numRows: edit.numRows,
      numCols: edit.numCols,
      oldValue: edit.oldValue,
      value: edit.value,
    },
    getCatData: getCategoryData,
    repo: liveIoRepository(),
    ui: SpreadsheetApp.getUi(),
    withLock: withDocumentLock,
    stash: (pending) => props.setProperty(PENDING_CATEGORY_SYNC_KEY, encodePendingSync(pending)),
  });
}

/** Idempotent — mirrors installWeeklyVisibilityTrigger's pattern (5_visibility.ts). */
export function installCategorySyncTrigger(): void {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "onEditCategorySync")
    .forEach((t) => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger("onEditCategorySync")
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
}

/** Menu item: re-attempts exactly the one stashed pending propagation, if any. */
export function retryLastCategorySync(): void {
  const props = PropertiesService.getScriptProperties();
  const pending = decodePendingSync(props.getProperty(PENDING_CATEGORY_SYNC_KEY));

  retryCategorySync({
    pending,
    repo: liveIoRepository(),
    ui: SpreadsheetApp.getUi(),
    withLock: withDocumentLock,
    clearStash: () => props.deleteProperty(PENDING_CATEGORY_SYNC_KEY),
    restash: (p) => props.setProperty(PENDING_CATEGORY_SYNC_KEY, encodePendingSync(p)),
  });
}
