// Ambient globals so non-module GAS files can call these without importing.
// At runtime, dist/lib/entries.js is loaded first (export keyword stripped by build step).
declare function findRowByEntryId(idColumnValues: unknown[], targetId: number): number | null;
