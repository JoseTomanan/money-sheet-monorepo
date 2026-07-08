// Ambient globals so non-module GAS files can call the dispatcher without importing.
// At runtime, dist/lib/dispatch.js is loaded (the `export` keyword is stripped by the
// build step) and its function declarations are hoisted into the shared GAS global scope.
// These declarations are derived directly from src/lib/dispatch.ts's own exported types
// (rather than hand-copied) so a wire-contract change there fails `tsc --noEmit` here
// instead of silently drifting (issue #109). See also _contract_parity.ts, which
// asserts the GAS-global domain types (Entry, CategoryMap, …) from 0_types.ts stay
// structurally identical to dispatch.ts's own EntryData/CategoryMap/….

type DispatchErrorCode = import("./lib/dispatch").ErrorCode;
type DispatchRequest = import("./lib/dispatch").DispatchRequest;
type DispatchDeps = import("./lib/dispatch").DispatchDeps;
type DispatchResponse = import("./lib/dispatch").ApiResponse;

declare const dispatch: typeof import("./lib/dispatch").dispatch;
