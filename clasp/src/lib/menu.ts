export function buildMenu(ui: GoogleAppsScript.Base.Ui): void {
  ui.createMenu("Autohide")
    .addItem("Run autohide now", "applyRowVisibilityForActiveSheet")
    .addItem("Install weekly trigger", "installWeeklyVisibilityTrigger")
    .addSeparator()
    .addItem("Run setup", "setup")
    .addToUi();

  // Separate menu (not folded into "Autohide") for the Subcategory
  // rename/delete sync trigger — see categorySync.ts / issue #126.
  ui.createMenu("Categories")
    .addItem("Install category-sync trigger", "installCategorySyncTrigger")
    .addItem("Retry last category sync", "retryLastCategorySync")
    .addToUi();
}
