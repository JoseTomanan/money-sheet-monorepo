import type { Entry, MasterRow, CategoryMap, Config, StatsData } from './types';

const KEY = 'ms_cache';

export interface CachePayload {
  entries: Entry[];
  master: MasterRow;
  categories: CategoryMap;
  config?: Config;
  stats?: StatsData;
}

export function readCache(): CachePayload | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CachePayload) : null;
  } catch {
    return null;
  }
}

export function writeCache(data: CachePayload): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}
