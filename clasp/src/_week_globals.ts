// Ambient globals so non-module GAS files can call these without importing.
// At runtime, dist/lib/weeks.js is loaded first (export keyword stripped by build step).
// Derived from the lib module's own exports (rather than hand-copied) so a signature
// change there fails `tsc --noEmit` here instead of silently drifting (issue #109).
declare const weekStartOfStr: typeof import("./lib/weeks").weekStartOfStr;
declare const weekLabelFromStr: typeof import("./lib/weeks").weekLabelFromStr;
declare const spreadsheetWeekLabelFromStr: typeof import("./lib/weeks").spreadsheetWeekLabelFromStr;
declare const weekTierFromStr: typeof import("./lib/weeks").weekTierFromStr;
declare const findInsertionIndex: typeof import("./lib/weeks").findInsertionIndex;
