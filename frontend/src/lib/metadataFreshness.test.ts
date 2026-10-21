import { expect, it } from 'vitest';
import { metadataIsFresh, METADATA_FRESHNESS_MS } from './metadataFreshness';

it('expires exactly at five minutes and rejects untrusted timestamps', () => {
  const now = 2_000_000;
  expect(metadataIsFresh(now - METADATA_FRESHNESS_MS + 1, now)).toBe(true);
  for (const value of [now - METADATA_FRESHNESS_MS, now + 1, undefined, null, '100', NaN, Infinity, -1, 0]) {
    expect(metadataIsFresh(value, now)).toBe(false);
  }
});
