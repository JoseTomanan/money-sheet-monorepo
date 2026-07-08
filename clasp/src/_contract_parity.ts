// Type-level parity guard (issue #109): asserts the GAS-global domain types declared
// in 0_types.ts and 2_entries.ts stay structurally identical to their canonical
// counterparts exported from src/lib/dispatch.ts. A `tsc --noEmit` failure here means
// one of the wire-contract copies has drifted from the other.
//
// This is deliberately a plain .ts file, not .d.ts: clasp/tsconfig.json sets
// `skipLibCheck: true`, which silently skips type-checking of *.d.ts files (including
// hand-written ones, not just library files) — a guard placed in a .d.ts here would
// never actually fire. Plain .ts files are unaffected by skipLibCheck. The file
// declares no runtime values (type aliases only), so it compiles to an empty output.

type __Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
  ? true
  : false;
type __Expect<T extends true> = T;

type __AssertEntry = __Expect<__Equal<Entry, import("./lib/dispatch").EntryData>>;
type __AssertAddEntryPayload = __Expect<__Equal<AddEntryPayload, import("./lib/dispatch").AddEntryPayload>>;
type __AssertUpdateEntryPatch = __Expect<__Equal<UpdateEntryPatch, import("./lib/dispatch").UpdateEntryPatch>>;
type __AssertCategoryMap = __Expect<__Equal<CategoryMap, import("./lib/dispatch").CategoryMap>>;
type __AssertConfigMap = __Expect<__Equal<ConfigMap, import("./lib/dispatch").ConfigMap>>;
