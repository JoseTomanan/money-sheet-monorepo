import type { Entry } from './types';
import { isDitto } from './splitEntry';

export interface WeekGroup {
  key: string;
  label: string;
  entries: Entry[];
}

export function weekStartOf(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay()); // rewind to Sunday
  return date.toISOString().slice(0, 10);
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function weekLabel(startStr: string): string {
  const [y, m, d] = startStr.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  const sm = MONTHS[start.getUTCMonth()];
  const em = MONTHS[end.getUTCMonth()];
  const sd = start.getUTCDate();
  const ed = end.getUTCDate();

  const ey = end.getUTCFullYear();
  return sm === em ? `${sm} ${sd} – ${ed}, ${ey}` : `${sm} ${sd} – ${em} ${ed}, ${ey}`;
}

export interface DatePosition {
  isFirstOfDate: boolean;
  isLastOfDate: boolean;
}

export function dateRunPositions(entries: Entry[]): DatePosition[] {
  return entries.map((entry, i) => ({
    isFirstOfDate: i === 0 || entries[i - 1].date !== entry.date,
    isLastOfDate:  i === entries.length - 1 || entries[i + 1].date !== entry.date,
  }));
}

/** Groups consecutive same-date entries into sub-arrays. Input order is preserved. */
export function groupEntriesByDate(entries: Entry[]): Entry[][] {
  const groups: Entry[][] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last[0].date === entry.date) {
      last.push(entry);
    } else {
      groups.push([entry]);
    }
  }
  return groups;
}

/**
 * Comparator for display-order sort: ascending by date, then ascending by id.
 * Optimistic entries (negative temp ids) always sort last within their date group
 * so they appear at the bottom — where they'll settle once the server confirms a
 * real (largest) id — avoiding a visible reorder/flicker.
 */
export function compareEntriesForDisplay(a: Entry, b: Entry): number {
  return (
    a.date.localeCompare(b.date) ||
    (a.id < 0 ? Number.MAX_SAFE_INTEGER : a.id) -
    (b.id < 0 ? Number.MAX_SAFE_INTEGER : b.id)
  );
}

export interface SplitPosition {
  inGroup: boolean;
  isFirst: boolean;
  isLast: boolean;
}

/**
 * Marks Split Entry runs within a display-ordered list.
 * A run is a real-description entry followed by consecutive ditto legs — any
 * description starting with '^^'. Entries that merely share a description are not grouped.
 */
export function splitRunPositions(entries: Entry[]): SplitPosition[] {
  return entries.map((entry, i) => {
    const thisIsDitto = isDitto(entry.description);
    const nextIsDitto = i + 1 < entries.length && isDitto(entries[i + 1].description);
    return {
      isFirst: !thisIsDitto,
      isLast: !nextIsDitto,
      inGroup: thisIsDitto || nextIsDitto,
    };
  });
}

export function groupByWeek(entries: Entry[]): WeekGroup[] {
  const map = new Map<string, Entry[]>();
  for (const entry of entries) {
    const key = weekStartOf(entry.date);
    const group = map.get(key);
    if (group) {
      group.push(entry);
    } else {
      map.set(key, [entry]);
    }
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entries]) => ({ key, label: weekLabel(key), entries }));
}
