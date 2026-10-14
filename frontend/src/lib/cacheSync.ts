import { readCache, writeCache } from './cache';
import type { CachePayload } from './cache';
import { dedupeEntries } from './dedupe';
import { financialScope } from './financialScope';

const EMPTY_STATS = { categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] };

export function loadSnapshot(scope = financialScope()): CachePayload | null {
  const cache = readCache(scope);
  if (!cache) return null;
  // Backward-compat: older cached snapshots predate `stats` (#130) — default it.
  return { ...cache, entries: dedupeEntries(cache.entries), stats: cache.stats ?? EMPTY_STATS };
}

export function saveSnapshot(data: CachePayload, scope = financialScope()): void {
  writeCache(data, scope);
}
