// Ambient globals for the pure visibility planner, callable from the GAS
// trigger without importing modules at runtime.
declare const maintainVisibility: typeof import("./lib/application/visibility").maintainVisibility;
declare type VisibilityRepository = import("./lib/application/visibility").VisibilityRepository;
