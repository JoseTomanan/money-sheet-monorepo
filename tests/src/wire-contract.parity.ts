/**
 * Wire-contract parity guard (issue #109) — asserts this package's `GasClient`
 * re-declared Entry wire types stay structurally identical to the canonical
 * definitions exported from clasp/src/lib/dispatch.ts. A `tsc --noEmit` failure here
 * means this copy has drifted from clasp's.
 *
 * Same cross-package relative-import pattern as frontend/src/lib/parity.test.ts and
 * frontend/src/lib/wire-contract.parity.ts — clasp/src/lib/dispatch.ts is pure TS with
 * no GAS globals, so it resolves as an ordinary module here. Deliberately no
 * `@ts-ignore`: we want real types, not `any`, so drift actually fails the check.
 *
 * This file declares no runtime values (type aliases only) and is not imported by
 * any test or the client itself.
 */

import type { Entry, AddEntryPayload, CategoryMap, ConfigMap, StatsData } from './client';
import type {
  EntryData,
  AddEntryPayload as ClaspAddEntryPayload,
  CategoryMap as ClaspCategoryMap,
  ConfigMap as ClaspConfigMap,
  StatsData as ClaspStatsData,
} from '../../clasp/src/lib/dispatch';

type __Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
  ? true
  : false;
type __Expect<T extends true> = T;

type __AssertEntry = __Expect<__Equal<Entry, EntryData>>;
type __AssertAddEntryPayload = __Expect<__Equal<AddEntryPayload, ClaspAddEntryPayload>>;
type __AssertCategoryMap = __Expect<__Equal<CategoryMap, ClaspCategoryMap>>;
type __AssertConfigMap = __Expect<__Equal<ConfigMap, ClaspConfigMap>>;
type __AssertStatsData = __Expect<__Equal<StatsData, ClaspStatsData>>;

// Note: tests/src/client.ts has no UpdateEntryPatch copy (GasClient never calls
// updateEntry), so there is nothing to parity-check for it here.
