import {
  bootstrapApiSecret,
  buildConnectionDetailsHtml,
  rotateApiSecret,
} from "./setup";

function showSecretDialog(secret: string): void {
  const output = HtmlService.createHtmlOutput(buildConnectionDetailsHtml(secret))
    .setWidth(520)
    .setHeight(230);
  SpreadsheetApp.getUi().showModalDialog(output, "Money Sheet connection");
}

export function showConnectionDetails(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const secret = bootstrapApiSecret(
    PropertiesService.getScriptProperties(),
    ss.getId(),
    () => Utilities.getUuid()
  );
  showSecretDialog(secret);
}

export function rotateConnectionSecret(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const secret = rotateApiSecret(
    PropertiesService.getScriptProperties(),
    SpreadsheetApp.getUi(),
    ss.getId(),
    () => Utilities.getUuid()
  );
  if (secret !== null) showSecretDialog(secret);
}
