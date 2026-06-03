// Ambient global so non-module GAS files can call runSetup without importing.
// At runtime, dist/lib/setup.js is loaded first (export keyword stripped by build step).
declare function runSetup(
  props: GoogleAppsScript.Properties.Properties,
  ui: GoogleAppsScript.Base.Ui,
  generateSecret: () => string
): void;
