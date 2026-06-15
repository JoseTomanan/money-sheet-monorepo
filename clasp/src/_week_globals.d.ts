// Ambient globals so non-module GAS files can call these without importing.
// At runtime, dist/lib/weeks.js is loaded first (export keyword stripped by build step).
declare function weekStartOfStr(dateStr: string): string;
declare function weekLabelFromStr(startStr: string): string;
declare function weekStartSunday(d: Date, tz: string): Date;
declare function formatWeekLabel(sunday: Date, tz: string): string;
declare function weekTier(weekStart: Date, currentWeekStart: Date): "current" | "recent" | "old";
declare function findInsertionIndex(existingDates: (Date | null)[], newDate: Date): number;
