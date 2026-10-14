import type { Entry, MasterRow, CategoryMap, Config, StatsData } from './types';
import { financialScope, scopedKey } from './financialScope';

export interface CachePayload {
  lastUpdated?: number;
  statsStale?: boolean;
  statsAvailable?: boolean;
  acknowledged?: { entries: Entry[]; deletedIds: number[] };
  entries: Entry[];
  master: MasterRow;
  categories: CategoryMap;
  config?: Config;
  stats?: StatsData;
}

export function readCache(scope = financialScope()): CachePayload | null {
  if (scope === null) return null;
  try {
    const raw = localStorage.getItem(scopedKey('ms_cache', scope));
    return raw ? (JSON.parse(raw) as CachePayload) : null;
  } catch {
    return null;
  }
}

export function writeCache(data: CachePayload, scope = financialScope()): void {
  if (scope === null) return;
  try {
    localStorage.setItem(scopedKey('ms_cache', scope), JSON.stringify(data));
  } catch {}
}
