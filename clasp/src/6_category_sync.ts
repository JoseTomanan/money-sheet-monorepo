/**
 * onEdit trigger for the Categories sheet: detects a Subcategory rename or
 * delete and propagates it into INCOMING/OUTGOING so existing entries
 * aren't orphaned (issue #126, building on #123's bare-Category recovery
 * path). All decision logic lives in lib/categorySync.ts (unit-tested); this
 * file only wires real SpreadsheetApp / LockService / PropertiesService /
 * ScriptApp collaborators into it. Not unit-testable — verify against a
 * real deployment.
 */

const PENDING_CATEGORY_SYNC_KEY = "PENDING_CATEGORY_SYNC";

// Same [Subcategory, Category] slice getCategories() reads (4_categories.ts),
// reused here so the collision check and parent-lookup share one read.
function getCategoryData(): CategoryRow[] {
  const sh = getCategoriesSheet();
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  return sh.getRange(2, 2, lastRow - 1, 2).getValues() as CategoryRow[];
}

function withDocumentLock<T>(fn: () => T): T {
  return runExclusive(LockService.getDocumentLock(), 10_000, fn);
}

/**
 * Installable-trigger target, bound via installCategorySyncTrigger() below —
 * deliberately not named `onEdit` (the reserved simple-trigger name), which
 * would lose LockService/PropertiesService access.
 */
function onEditCategorySync(e: GoogleAppsScript.Events.SheetsOnEdit): void {
  const range = e.range;
  const props = PropertiesService.getScriptProperties();

  runCategorySync({
    edit: {
      isCategoriesSheet: range.getSheet().getName() === "Categories",
      column: range.getColumn(),
      row: range.getRow(),
      numRows: range.getNumRows(),
      numCols: range.getNumColumns(),
      oldValue: e.oldValue,
      value: e.value,
    },
    getCatData: getCategoryData,
    repo: liveIoRepository(),
    ui: SpreadsheetApp.getUi(),
    withLock: withDocumentLock,
    stash: (pending) => props.setProperty(PENDING_CATEGORY_SYNC_KEY, encodePendingSync(pending)),
  });
}

/** Idempotent — mirrors installWeeklyVisibilityTrigger's pattern (5_visibility.ts). */
function installCategorySyncTrigger(): void {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "onEditCategorySync")
    .forEach((t) => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger("onEditCategorySync")
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
}

/** Menu item: re-attempts exactly the one stashed pending propagation, if any. */
function retryLastCategorySync(): void {
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
