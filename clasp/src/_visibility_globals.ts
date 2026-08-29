// Ambient globals for the pure visibility planner, callable from the GAS
// trigger without importing modules at runtime.
declare const maintainVisibility: typeof import("./lib/visibility").maintainVisibility;
