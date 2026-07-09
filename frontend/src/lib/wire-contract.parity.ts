/**
 * Wire-contract parity guard (issue #109) — asserts this package's hand-copied Entry
 * wire types stay structurally identical to the canonical definitions exported from
 * clasp/src/lib/dispatch.ts. A `svelte-check`/`tsc` failure here means this copy has
 * drifted from clasp's.
 *
 * Same cross-package relative-import pattern as the existing runtime parity test
 * (./parity.test.ts) — clasp/src/lib/dispatch.ts is pure TS with no GAS globals, so it
 * resolves as an ordinary module here. Deliberately no `@ts-ignore`: we want real types,
 * not `any`, so drift actually fails the check.
 *
 * This file declares no runtime values (type aliases only) and is never imported by
 * app code, so it contributes nothing to the built bundle.
 */

import type { Entry, AddEntryPayload, AddEntriesPayload, UpdateEntryPatch, CategoryMap, Config, ApiErrorEnvelope } from './types';
import type {
  EntryData,
  AddEntryPayload as ClaspAddEntryPayload,
  AddEntriesPayload as ClaspAddEntriesPayload,
  UpdateEntryPatch as ClaspUpdateEntryPatch,
  CategoryMap as ClaspCategoryMap,
  ApiResponse,
} from '../../../clasp/src/lib/dispatch';

type __Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
  ? true
  : false;
type __Expect<T extends true> = T;

type __AssertEntry = __Expect<__Equal<Entry, EntryData>>;
type __AssertAddEntryPayload = __Expect<__Equal<AddEntryPayload, ClaspAddEntryPayload>>;
type __AssertAddEntriesPayload = __Expect<__Equal<AddEntriesPayload, ClaspAddEntriesPayload>>;
type __AssertUpdateEntryPatch = __Expect<__Equal<UpdateEntryPatch, ClaspUpdateEntryPatch>>;
type __AssertCategoryMap = __Expect<__Equal<CategoryMap, ClaspCategoryMap>>;

// The error envelope's failure arm: `{ ok: false; error; code; message }`.
type __ApiErrorFromDispatch = Extract<ApiResponse, { ok: false }>;
type __AssertApiErrorEnvelope = __Expect<__Equal<ApiErrorEnvelope, __ApiErrorFromDispatch>>;

// Config is intentionally NOT equality-checked: the frontend's `Config` enriches the
// wire ConfigMap with a required `currency` field (with a default applied client-side),
// so it is a stricter, non-identical shape. An assignability check instead guards that
// it's still a plain string-keyed record compatible with the wire shape.
type __AssertConfigIsStringRecord = __Expect<Config extends Record<string, string> ? true : false>;
