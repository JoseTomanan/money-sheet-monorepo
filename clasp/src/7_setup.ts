function setup(): void {
  runSetup(
    PropertiesService.getScriptProperties(),
    SpreadsheetApp.getUi(),
    () => Utilities.getUuid()
  );
}
