const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/**
 * Canonical week-start definition, kept in parity with frontend/src/lib/groupEntries.ts weekStartOf.
 * Parity is enforced by frontend/src/lib/parity.test.ts — a red test there means the two have diverged.
 *
 * Given a calendar date as "YYYY-MM-DD", returns the ISO date string of the
 * Sunday on or before that date. Computation is purely arithmetic on the
 * year/month/day components — no Date timezone interpretation, no host-TZ
 * dependence — so both packages always agree for the same calendar date.
 */
export function weekStartOfStr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay()); // rewind to Sunday
  return date.toISOString().slice(0, 10);
}

/**
 * Formats a week label from a week-start date string (YYYY-MM-DD).
 * Produces the same format as frontend's weekLabel():
 *   "Mon D – D, YYYY"        (same month)
 *   "Mon D – Mon D, YYYY"    (cross-month)
 * Year is always the year of the Saturday (end of week).
 */
export function weekLabelFromStr(startStr: string): string {
  const [y, m, d] = startStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  const sm = MONTHS[start.getUTCMonth()];
  const em = MONTHS[end.getUTCMonth()];
  const sd = start.getUTCDate();
  const ed = end.getUTCDate();
  const ey = end.getUTCFullYear();

  return sm === em
    ? `${sm} ${sd} – ${ed}, ${ey}`
    : `${sm} ${sd} – ${em} ${ed}, ${ey}`;
}

/** Spreadsheet separator labels are intentionally uppercase and year-free. */
export function spreadsheetWeekLabelFromStr(startStr: string): string {
  const [y, m, d] = startStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const startMonth = MONTHS[start.getUTCMonth()];
  const endMonth = MONTHS[end.getUTCMonth()];
  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();

  return startMonth === endMonth
    ? `${startMonth} ${startDay}-${endDay}`.toUpperCase()
    : `${startMonth} ${startDay} - ${endMonth} ${endDay}`.toUpperCase();
}

export function weekTierFromStr(weekStart: string, currentWeekStart: string): "current" | "recent" | "old" {
  const diffMs = Date.parse(`${currentWeekStart}T00:00:00Z`) - Date.parse(`${weekStart}T00:00:00Z`);
  const diffWeeks = Math.round(diffMs / (7 * 24 * 3600 * 1000));
  if (diffWeeks === 0) return "current";
  if (diffWeeks <= 4) return "recent";
  return "old";
}

export function findInsertionIndex(existingDates: (Date | null)[], newDate: Date): number {
  for (let i = 0; i < existingDates.length; i++) {
    const d = existingDates[i];
    if (d !== null && d.getTime() > newDate.getTime()) return i;
  }
  return existingDates.length;
}
