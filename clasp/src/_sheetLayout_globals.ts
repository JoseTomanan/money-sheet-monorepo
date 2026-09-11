// Ambient globals for the shared layout contract and coordinate helpers.
// Runtime definitions come from dist/lib/0_sheetLayout.js, which sorts before
// every other lib file after scripts/strip-exports.js removes module syntax.
declare const SHEET_LAYOUT: typeof import("./lib/0_sheetLayout").SHEET_LAYOUT;
declare const columnToA1: typeof import("./lib/0_sheetLayout").columnToA1;
declare const rangeWidth: typeof import("./lib/0_sheetLayout").rangeWidth;
declare const columnIndexWithinRange: typeof import("./lib/0_sheetLayout").columnIndexWithinRange;
