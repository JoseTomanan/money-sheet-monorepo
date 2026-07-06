import { readCache, writeCache } from './cache';
import type { CachePayload } from './cache';
import { dedupeEntries } from './dedupe';

export function loadSnapshot(): CachePayload | null {
  const cache = readCache();
  if (!cache) return null;
  return { ...cache, entries: dedupeEntries(cache.entries) };
}

export function saveSnapshot(data: CachePayload): void {
  writeCache(data);
}
