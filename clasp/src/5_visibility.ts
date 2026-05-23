const MANILA_TZ = "Asia/Manila";

function applyRowVisibility(sh: GoogleAppsScript.Spreadsheet.Sheet): void {
  let lastRow = sh.getLastRow();
  if (lastRow < 2) return;

  // Pass 1: insert missing separators for all completed weeks
  _insertMissingSeparators(sh);

  // Pass 2: apply hide/show per visibility tier
  lastRow = sh.getLastRow();
  if (lastRow < 2) return;

  const data = sh.getRange(2, COL.DATE, lastRow - 1, 7).getValues();
  const now = new Date();
  const currentWeekStart = weekStartSunday(now, MANILA_TZ);

  for (let i = 0; i < data.length; i++) {
    const sheetRow = i + 2;
    const rawDate = data[i][0]; // col B
    const id = data[i][6]; // col H
    const isSeparator = id === "" || id === null || id === undefined;

    if (!rawDate) {
      // No date at all — keep visible (shouldn't happen)
      sh.showRows(sheetRow);
      continue;
    }

    const rowDate = rawDate instanceof Date ? rawDate : new Date(String(rawDate));
    const rowWeekStart = weekStartSunday(rowDate, MANILA_TZ);
    const tier = weekTier(rowWeekStart, currentWeekStart);

    if (tier === "current") {
      sh.showRows(sheetRow);
    } else if (tier === "recent") {
      if (isSeparator) {
        sh.showRows(sheetRow);
      } else {
        sh.hideRows(sheetRow);
      }
    } else {
      sh.hideRows(sheetRow);
    }
  }
}

function insertSeparatorIfMissing(
  weekSunday: Date,
  sh: GoogleAppsScript.Spreadsheet.Sheet
): void {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;

  const data = sh.getRange(2, COL.DATE, lastRow - 1, 7).getValues();

  // Find first entry row belonging to this week
  let firstEntrySheetRow = -1;
  for (let i = 0; i < data.length; i++) {
    const rawDate = data[i][0];
    const id = data[i][6];
    const isEntry = id !== "" && id !== null && id !== undefined;
    if (!isEntry) continue;

    const rowDate = rawDate instanceof Date ? rawDate : new Date(String(rawDate));
    const rowWeekStart = weekStartSunday(rowDate, MANILA_TZ);
    if (rowWeekStart.getTime() === weekSunday.getTime()) {
      firstEntrySheetRow = i + 2;
      break;
    }
  }

  if (firstEntrySheetRow === -1) return; // no entries for this week

  // Check if the row above is already the separator for this week
  if (firstEntrySheetRow > 2) {
    const aboveData = sh.getRange(firstEntrySheetRow - 1, COL.DATE, 1, 7).getValues()[0];
    const aboveDate = aboveData[0];
    const aboveId = aboveData[6];
    const aboveIsSeparator = aboveId === "" || aboveId === null || aboveId === undefined;
    if (aboveIsSeparator && aboveDate instanceof Date && aboveDate.getTime() === weekSunday.getTime()) {
      return; // separator already present
    }
  }

  // Insert separator row before first entry of this week
  sh.insertRowBefore(firstEntrySheetRow);
  sh.getRange(firstEntrySheetRow, COL.DATE).setValue(weekSunday);
  sh.getRange(firstEntrySheetRow, COL.DESC).setValue(formatWeekLabel(weekSunday, MANILA_TZ));
  // Leave TAG, MAIN_CAT, DIR, AMOUNT, ID blank — col H blank is what marks it as a separator
}

function _insertMissingSeparators(sh: GoogleAppsScript.Spreadsheet.Sheet): void {
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return;

  const data = sh.getRange(2, COL.DATE, lastRow - 1, 7).getValues();
  const now = new Date();
  const currentWeekStart = weekStartSunday(now, MANILA_TZ);

  // Collect distinct completed weeks that have entries
  const completedWeekStarts = new Map<number, Date>(); // ms timestamp → Date
  for (const row of data) {
    const rawDate = row[0];
    const id = row[6];
    const isEntry = id !== "" && id !== null && id !== undefined;
    if (!isEntry || !rawDate) continue;

    const rowDate = rawDate instanceof Date ? rawDate : new Date(String(rawDate));
    const ws = weekStartSunday(rowDate, MANILA_TZ);
    if (ws.getTime() !== currentWeekStart.getTime()) {
      completedWeekStarts.set(ws.getTime(), ws);
    }
  }

  // Insert separators oldest-first so row indices stay valid as we insert upward
  const sortedWeeks = Array.from(completedWeekStarts.values()).sort(
    (a, b) => a.getTime() - b.getTime()
  );
  for (const weekSunday of sortedWeeks) {
    insertSeparatorIfMissing(weekSunday, sh);
  }
}

function applyRowVisibilityForActiveSheet(): void {
  applyRowVisibility(getIOSheet());
}

function installWeeklyVisibilityTrigger(): void {
  // Remove any existing trigger for this function
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
