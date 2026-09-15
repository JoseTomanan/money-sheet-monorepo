// Ambient globals so non-module GAS files can call the dispatcher without importing.
// At runtime, dist/lib/dispatch.js is loaded (the `export` keyword is stripped by the
// build step) and its function declarations are hoisted into the shared GAS global scope.
// These declarations are derived directly from src/lib/dispatch.ts's own exported types
// (rather than hand-copied) so a wire-contract change there fails `tsc --noEmit` here
// instead of silently drifting (issue #109). See also _contract_parity.ts, which
// asserts the GAS-global domain types from 0_types.ts stay structurally identical
// to their canonical Domain counterparts.

type DispatchErrorCode = import("./lib/application/dispatch").ErrorCode;
type DispatchRequest = import("./lib/application/dispatch").DispatchRequest;
type DispatchDeps = import("./lib/application/dispatch").DispatchDeps;
type DispatchResponse = import("./lib/application/dispatch").ApiResponse;

declare const dispatch: typeof import("./lib/application/dispatch").dispatch;
