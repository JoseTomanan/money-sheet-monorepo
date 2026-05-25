// Ambient global so non-module GAS files can call buildMenu without importing.
// At runtime, dist/lib/menu.js is loaded first (export keyword stripped by build step).
declare function buildMenu(ui: GoogleAppsScript.Base.Ui): void;
