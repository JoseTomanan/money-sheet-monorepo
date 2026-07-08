// Ambient global so non-module GAS files can call runSetup without importing.
// At runtime, dist/lib/setup.js is loaded first (export keyword stripped by build step).
// Derived from the lib module's own export so a signature change there fails
// `tsc --noEmit` here instead of silently drifting (issue #109).
declare const runSetup: typeof import("./lib/setup").runSetup;
