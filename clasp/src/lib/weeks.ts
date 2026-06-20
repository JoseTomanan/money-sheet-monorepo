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

export function weekStartSunday(d: Date, tz: string): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekday = parts.find((p) => p.type === "weekday")!.value;
  const hour = Number(parts.find((p) => p.type === "hour")!.value) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")!.value);
  const second = Number(parts.find((p) => p.type === "second")!.value);
  const dayIndex = DAYS.indexOf(weekday);

  const msSinceSundayMidnight =
    (dayIndex * 24 * 3600 + hour * 3600 + minute * 60 + second) * 1000;

  return new Date(d.getTime() - msSinceSundayMidnight);
}

export function formatWeekLabel(sunday: Date, tz: string): string {
  const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { ...opts, timeZone: tz }).format(d);

  const saturday = new Date(sunday.getTime() + 6 * 24 * 60 * 60 * 1000);
  const sunMonth = fmt(sunday, { month: "short" });
  const satMonth = fmt(saturday, { month: "short" });
  const sunDay = fmt(sunday, { day: "numeric" });
  const satDay = fmt(saturday, { day: "numeric" });

  if (sunMonth === satMonth) {
    return `${sunMonth} ${sunDay}-${satDay}`.toUpperCase();
  }
  return `${sunMonth} ${sunDay} - ${satMonth} ${satDay}`.toUpperCase();
}

export function weekTier(weekStart: Date, currentWeekStart: Date): "current" | "recent" | "old" {
  const diffMs = currentWeekStart.getTime() - weekStart.getTime();
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
