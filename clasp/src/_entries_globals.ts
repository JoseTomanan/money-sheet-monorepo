// Ambient globals so non-module GAS files can call these without importing.
// At runtime, dist/lib/entries.js is loaded first (export keyword stripped by build step).
// Derived from the lib module's own export so a signature change there fails
// `tsc --noEmit` here instead of silently drifting (issue #109).
declare const findRowByEntryId: typeof import("./lib/entries").findRowByEntryId;
