export function buildMenu(ui: GoogleAppsScript.Base.Ui): void {
  ui.createMenu("Autohide")
    .addItem("Run autohide now", "applyRowVisibilityForActiveSheet")
    .addItem("Install weekly trigger", "installWeeklyVisibilityTrigger")
    .addToUi();
}
