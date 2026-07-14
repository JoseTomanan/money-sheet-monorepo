import { readCache, writeCache } from './cache';
import type { CachePayload } from './cache';
import { dedupeEntries } from './dedupe';

const EMPTY_STATS = { categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] };

export function loadSnapshot(): CachePayload | null {
  const cache = readCache();
  if (!cache) return null;
  // Backward-compat: older cached snapshots predate `stats` (#130) — default it.
  return { ...cache, entries: dedupeEntries(cache.entries), stats: cache.stats ?? EMPTY_STATS };
}

export function saveSnapshot(data: CachePayload): void {
  writeCache(data);
}
