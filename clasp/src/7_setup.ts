function setup(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  runSetup(
    PropertiesService.getScriptProperties(),
    SpreadsheetApp.getUi(),
    () => Utilities.getUuid()
  );
  ensureConfigSheet(ss);
  ensureStatsSheet(ss);
}
