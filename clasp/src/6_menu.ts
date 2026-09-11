function onOpen(event?: GoogleAppsScript.Events.SheetsOnOpen): void {
  const spreadsheet = event?.source ?? SpreadsheetApp.getActiveSpreadsheet();
  bootstrapApiSecret(
    PropertiesService.getScriptProperties(),
    spreadsheet.getId(),
    () => Utilities.getUuid()
  );
  buildMenu(SpreadsheetApp.getUi());
}
