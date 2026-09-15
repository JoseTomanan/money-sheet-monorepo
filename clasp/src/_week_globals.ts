// Ambient globals so non-module GAS files can call these without importing.
// At runtime, the flattened Domain calendar module loads before its consumers.
// Derived from the lib module's own exports (rather than hand-copied) so a signature
// change there fails `tsc --noEmit` here instead of silently drifting (issue #109).
declare const weekStartOfStr: typeof import("./lib/domain/calendar").weekStartOfStr;
declare const weekLabelFromStr: typeof import("./lib/domain/calendar").weekLabelFromStr;
declare const spreadsheetWeekLabelFromStr: typeof import("./lib/domain/calendar").spreadsheetWeekLabelFromStr;
declare const weekTierFromStr: typeof import("./lib/domain/calendar").weekTierFromStr;
declare const findInsertionIndex: typeof import("./lib/domain/calendar").findInsertionIndex;
