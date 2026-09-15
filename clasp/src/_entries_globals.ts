// Ambient globals so non-module GAS files can call these without importing.
// At runtime, dist/lib/entries.js is loaded first (export keyword stripped by build step).
// Derived from the lib module's own export so a signature change there fails
// `tsc --noEmit` here instead of silently drifting (issue #109).
declare const createEntryApplication: typeof import("./lib/application/entries").createEntryApplication;
declare type EntryRepository = import("./lib/application/entries").EntryRepository;
