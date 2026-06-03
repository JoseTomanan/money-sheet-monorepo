// Ambient globals so non-module GAS files can call parseConfigRows and
// ensureConfigSheet without importing. At runtime, dist/lib/config.js is
// loaded first (export keyword stripped by build step).
declare function parseConfigRows(rows: unknown[][]): Record<string, string>;

declare function ensureConfigSheet(
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
  defaults?: [string, string][]
): void;
