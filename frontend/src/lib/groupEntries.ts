import type { Entry } from './types';

export interface WeekGroup {
  key: string;
  label: string;
  entries: Entry[];
}

function weekStartOf(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - date.getUTCDay()); // rewind to Sunday
  return date.toISOString().slice(0, 10);
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function weekLabel(startStr: string): string {
  const [y, m, d] = startStr.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  const sm = MONTHS[start.getUTCMonth()];
  const em = MONTHS[end.getUTCMonth()];
  const sd = start.getUTCDate();
  const ed = end.getUTCDate();

  return sm === em ? `${sm} ${sd} – ${ed}` : `${sm} ${sd} – ${em} ${ed}`;
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
