const MANILA_TZ = "Asia/Manila";

/** Converts a raw Sheet date to the calendar string consumed by the pure planner. */
function formatVisibilityDate(raw: unknown): string {
  try {
    return Utilities.formatDate(raw as Date, MANILA_TZ, "yyyy-MM-dd");
  } catch {
    return raw ? String(raw) : "";
  }
}

function currentVisibilityDate(): string {
  return Utilities.formatDate(new Date(), MANILA_TZ, "yyyy-MM-dd");
}

// Runs under the same document lock as every entry mutation (2_entries.ts).
// The lock covers both snapshots and all row shifts from separator insertion;
// see docs/adr/0009.
function applyRowVisibility(sh: GoogleAppsScript.Spreadsheet.Sheet): void {
  maintainVisibility(liveIoRepository(sh), currentVisibilityDate(), formatVisibilityDate);
}

function applyRowVisibilityForActiveSheet(): void {
  runExclusive(LockService.getDocumentLock(), 10_000, () => applyRowVisibility(getIOSheet()));
}

function installWeeklyVisibilityTrigger(): void {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "applyRowVisibilityForActiveSheet")
    .forEach((t) => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger("applyRowVisibilityForActiveSheet")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(1)
    .inTimezone(MANILA_TZ)
    .create();
}
