// Ambient globals so non-module GAS files can call these without importing.
// At runtime, dist/lib/weeks.js is loaded first (export keyword stripped by build step).
declare function weekStartSunday(d: Date, tz: string): Date;
declare function formatWeekLabel(sunday: Date, tz: string): string;
declare function weekTier(weekStart: Date, currentWeekStart: Date): "current" | "recent" | "old";
declare function findInsertionIndex(existingDates: (Date | null)[], newDate: Date): number;
