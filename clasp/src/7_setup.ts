function showSecretDialog(secret: string): void {
  const output = HtmlService.createHtmlOutput(buildConnectionDetailsHtml(secret))
    .setWidth(520)
    .setHeight(230);
  SpreadsheetApp.getUi().showModalDialog(output, "Money Sheet connection");
}

function showConnectionDetails(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const secret = bootstrapApiSecret(
    PropertiesService.getScriptProperties(),
    ss.getId(),
    () => Utilities.getUuid()
  );
  showSecretDialog(secret);
}

function rotateConnectionSecret(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const secret = rotateApiSecret(
    PropertiesService.getScriptProperties(),
    SpreadsheetApp.getUi(),
    ss.getId(),
    () => Utilities.getUuid()
  );
  if (secret !== null) showSecretDialog(secret);
}
