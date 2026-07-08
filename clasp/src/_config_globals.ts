// Ambient globals so non-module GAS files can call parseConfigRows and
// ensureConfigSheet without importing. At runtime, dist/lib/config.js is
// loaded first (export keyword stripped by build step).
// Derived from the lib module's own exports so a signature change there fails
// `tsc --noEmit` here instead of silently drifting (issue #109).
declare const parseConfigRows: typeof import("./lib/config").parseConfigRows;
declare const ensureConfigSheet: typeof import("./lib/config").ensureConfigSheet;
