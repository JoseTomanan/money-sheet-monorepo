// Ambient globals so non-module GAS files can call these without importing.
// At runtime, dist/lib/categorySync.js is loaded first (export keyword stripped by build step).
// Derived from the lib module's own exports so a signature change there fails
// `tsc --noEmit` here instead of silently drifting (issue #109).
declare const runCategorySync: typeof import("./lib/categorySync").runCategorySync;
declare const retryCategorySync: typeof import("./lib/categorySync").retryCategorySync;
declare const encodePendingSync: typeof import("./lib/categorySync").encodePendingSync;
declare const decodePendingSync: typeof import("./lib/categorySync").decodePendingSync;
declare type CategoryRow = import("./lib/categorySync").CategoryRow;
declare type PendingCategorySync = import("./lib/categorySync").PendingCategorySync;
