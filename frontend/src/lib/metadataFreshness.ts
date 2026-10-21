export const METADATA_FRESHNESS_MS = 5 * 60 * 1000;

/** Persisted wall-clock times are untrusted; future/invalid times cannot skip reads. */
export function metadataIsFresh(fetchedAt: unknown, now = Date.now()): boolean {
  return typeof fetchedAt === 'number' && Number.isFinite(fetchedAt) && fetchedAt > 0
    && fetchedAt <= now && now - fetchedAt < METADATA_FRESHNESS_MS;
}
