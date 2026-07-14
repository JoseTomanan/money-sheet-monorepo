import type { Direction, Entry } from './types';

// Per ADR-0011 ("sheet owns all derived computation"), derived funds/statistics
// metrics (totals, pace curves, category rankings, etc.) are computed by the
// spreadsheet (MASTER + STATS) and read via `getMaster`/`getStats` — the
// frontend renders them, it does not compute them. The two functions below
// are a deliberate exception: they operate on the live, currently-loaded
// entry log (including unsynced Local Entries still in the offline queue),
// not on funds/statistics data. They drive UI affordances only — filter-chip
// counts and the Home screen's "last entry" date — that must reflect what's
// on screen right now, including entries the sheet hasn't seen yet. Do not
// "helpfully" move these into STATS: STATS is sheet-derived and synced data
// only, and these need entries the sheet doesn't have yet.

/** The most recent entry date (ISO string), or null when there are no entries. */
export function latestEntryDate(entries: Entry[]): string | null {
  return entries.length > 0
    ? entries.reduce((max, e) => (e.date > max ? e.date : max), entries[0].date)
    : null;
}

export function countByCategory(entries: Entry[], direction?: Direction): Record<string, number> {
  const result: Record<string, number> = {};
  for (const e of entries) {
    if (direction !== undefined && e.direction !== direction) continue;
    result[e.mainCategory] = (result[e.mainCategory] ?? 0) + 1;
  }
  return result;
}
