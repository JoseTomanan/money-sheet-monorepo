import type { DispatchDeps } from "./application/dispatch";
import { getCategories } from "./infrastructure/categories";
import {
  installCategorySyncTrigger,
  applyCategorySyncEdit,
  retryLastCategorySync,
} from "./infrastructure/categorySyncGas";
import { getConfig } from "./infrastructure/configReader";
import { rotateConnectionSecret, showConnectionDetails } from "./infrastructure/connectionUi";
import { addEntries, addEntry, deleteEntry, getEntries, updateEntry } from "./infrastructure/entries";
import { getMaster } from "./infrastructure/masterReader";
import { bootstrapApiSecret } from "./infrastructure/setup";
import { getStats } from "./infrastructure/statsReader";
import {
  applyRowVisibilityForActiveSheet,
  installWeeklyVisibilityTrigger,
} from "./infrastructure/visibility";
import { handleGet, handlePost } from "./presentation/http";
import { handleCategorySyncEdit } from "./presentation/categorySync";
import { buildMenu } from "./presentation/menu";

function dispatchDeps(): DispatchDeps {
  return {
    secret: PropertiesService.getScriptProperties().getProperty("API_SECRET") ?? "",
    getCategories,
    getMaster,
    getEntries,
    getConfig,
    getStats,
    getEntryById: (id) => getEntries().find((entry) => entry.id === id) ?? null,
    addEntry,
    addEntries,
    updateEntry,
    deleteEntry,
  };
}

function jsonOutput(value: object): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

export function compositionDoGet(
  event: GoogleAppsScript.Events.DoGet,
): GoogleAppsScript.Content.TextOutput {
  return jsonOutput(handleGet(event.parameter, dispatchDeps()));
}

export function compositionDoPost(
  event: GoogleAppsScript.Events.DoPost,
): GoogleAppsScript.Content.TextOutput {
  return jsonOutput(handlePost(event.postData.contents, dispatchDeps()));
}

export function compositionOnOpen(event?: GoogleAppsScript.Events.SheetsOnOpen): void {
  const spreadsheet = event?.source ?? SpreadsheetApp.getActiveSpreadsheet();
  bootstrapApiSecret(
    PropertiesService.getScriptProperties(),
    spreadsheet.getId(),
    () => Utilities.getUuid(),
  );
  buildMenu(SpreadsheetApp.getUi());
}

export const compositionApplyRowVisibility = applyRowVisibilityForActiveSheet;
export const compositionInstallWeeklyVisibilityTrigger = installWeeklyVisibilityTrigger;
export function compositionOnEditCategorySync(
  event: GoogleAppsScript.Events.SheetsOnEdit,
): void {
  handleCategorySyncEdit(event, applyCategorySyncEdit);
}
export const compositionInstallCategorySyncTrigger = installCategorySyncTrigger;
export const compositionRetryLastCategorySync = retryLastCategorySync;
export const compositionShowConnectionDetails = showConnectionDetails;
export const compositionRotateConnectionSecret = rotateConnectionSecret;
