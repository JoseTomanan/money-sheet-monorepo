function onEditCategorySync(e: GoogleAppsScript.Events.SheetsOnEdit): void {
  compositionOnEditCategorySync(e);
}

function installCategorySyncTrigger(): void {
  compositionInstallCategorySyncTrigger();
}

function retryLastCategorySync(): void {
  compositionRetryLastCategorySync();
}
