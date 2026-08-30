// Ambient global so the numbered GAS entrypoint can call the pure MASTER
// parser. Its declaration is derived from the module export to prevent drift.
declare const parseMasterRows: typeof import("./lib/master").parseMasterRows;
