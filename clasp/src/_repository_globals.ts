// Ambient globals so non-module GAS files can call these without importing.
// At runtime, dist/lib/repository.js is loaded first (export keyword stripped by build step).
// Derived from the lib module's own exports so a signature change there fails
// `tsc --noEmit` here instead of silently drifting (issue #109).
declare const IO_COL: typeof import("./lib/repository").IO_COL;
declare const ID_INDEX: typeof import("./lib/repository").ID_INDEX;
declare const isSeparatorRow: typeof import("./lib/repository").isSeparatorRow;
declare const planFieldWrites: typeof import("./lib/repository").planFieldWrites;
declare const listEntries: typeof import("./lib/repository").listEntries;
declare const insertEntry: typeof import("./lib/repository").insertEntry;
declare const insertEntries: typeof import("./lib/repository").insertEntries;
declare const patchEntry: typeof import("./lib/repository").patchEntry;
declare const removeEntry: typeof import("./lib/repository").removeEntry;
declare type IoRepository = import("./lib/repository").IoRepository;
declare type IoRow = import("./lib/repository").IoRow;
