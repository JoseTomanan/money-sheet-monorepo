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
    return `${sunMonth} ${sunDay}–${satDay}`;
  }
  return `${sunMonth} ${sunDay} – ${satMonth} ${satDay}`;
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
