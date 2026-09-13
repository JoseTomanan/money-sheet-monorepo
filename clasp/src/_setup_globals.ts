// Ambient globals so non-module GAS files can call setup helpers without importing.
// At runtime, dist/lib/setup.js is loaded first (export keyword stripped by build step).
// Derived from the lib module's own export so a signature change there fails
// `tsc --noEmit` here instead of silently drifting (issue #109).
declare const bootstrapApiSecret: typeof import("./lib/setup").bootstrapApiSecret;
declare const buildConnectionDetailsHtml: typeof import("./lib/setup").buildConnectionDetailsHtml;
declare const rotateApiSecret: typeof import("./lib/setup").rotateApiSecret;
