// Ambient globals so non-module GAS files can call stats.ts's exports without
// importing. At runtime, dist/lib/stats.js is loaded first (export keyword
// stripped by the build step). Derived from the lib module's own exports so a
// signature change there fails `tsc --noEmit` here instead of silently
// drifting (issue #109).
declare const ensureStatsSheet: typeof import("./lib/stats").ensureStatsSheet;
declare const STATS_SHEET_NAME: typeof import("./lib/stats").STATS_SHEET_NAME;
declare const STATS_ROWS: typeof import("./lib/stats").STATS_ROWS;
declare const STATS_WINDOW_ROWS: typeof import("./lib/stats").STATS_WINDOW_ROWS;
declare const STATS_WINDOWS: typeof import("./lib/stats").STATS_WINDOWS;
