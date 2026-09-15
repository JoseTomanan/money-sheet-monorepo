const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Preserves the API's canonical ISO date-string validation semantics. */
export function isValidCalendarDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const date = new Date(value);
  return !isNaN(date.getTime());
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Returns the Sunday on or before a YYYY-MM-DD calendar date. */
export function weekStartOfStr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

export function weekLabelFromStr(startStr: string): string {
  const [y, m, d] = startStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  const startMonth = MONTHS[start.getUTCMonth()];
  const endMonth = MONTHS[end.getUTCMonth()];
  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();
  const endYear = end.getUTCFullYear();

  return startMonth === endMonth
    ? `${startMonth} ${startDay} – ${endDay}, ${endYear}`
    : `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${endYear}`;
}

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

export function weekTierFromStr(
  weekStart: string,
  currentWeekStart: string,
): "current" | "recent" | "old" {
  const diffMs = Date.parse(`${currentWeekStart}T00:00:00Z`)
    - Date.parse(`${weekStart}T00:00:00Z`);
  const diffWeeks = Math.round(diffMs / (7 * 24 * 3600 * 1000));
  if (diffWeeks === 0) return "current";
  if (diffWeeks <= 4) return "recent";
  return "old";
}

export function findInsertionIndex(existingDates: (Date | null)[], newDate: Date): number {
  for (let i = 0; i < existingDates.length; i++) {
    const date = existingDates[i];
    if (date !== null && date.getTime() > newDate.getTime()) return i;
  }
  return existingDates.length;
}
