/**
 * Pure week-separator and row-visibility planning.
 *
 * The GAS boundary supplies calendar-date formatting for raw Sheet values; all
 * grouping and visibility decisions below operate on canonical YYYY-MM-DD
 * strings, so they can be tested without SpreadsheetApp or a host timezone.
 */
import {
  spreadsheetWeekLabelFromStr,
  weekStartOfStr,
  weekTierFromStr,
} from "../domain/calendar";

export interface VisibilityRow {
  sheetRow: number;
  date: string;
  separator: boolean;
}

export interface VisibilityRepository {
  readRows(): VisibilityRow[];
  insertSeparatorRow(sheetRow: number, weekStart: string, label: string): void;
  setRowVisibility(sheetRow: number, numRows: number, visible: boolean): void;
}

export interface SeparatorInsertion {
  /** 1-based sheet row in the pre-insertion snapshot. */
  sheetRow: number;
  weekStart: string;
  label: string;
}

export interface VisibilityRange {
  /** 1-based first sheet row in the post-insertion snapshot. */
  sheetRow: number;
  numRows: number;
  visible: boolean;
}

function dateStringOf(raw: string): string | null {
  if (!raw) return null;
  const dateStr = raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;

  const parsed = new Date(`${dateStr}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateStr
    ? null
    : dateStr;
}

function weekStartOfRow(row: VisibilityRow): string | null {
  const dateStr = dateStringOf(row.date);
  return dateStr === null ? null : weekStartOfStr(dateStr);
}

/**
 * Finds current or completed weeks whose first Entry is not immediately
 * preceded by that week's separator. Descending sheet-row order lets callers
 * apply every plan to the same snapshot without adjusting later coordinates
 * after an insert.
 */
export function planMissingSeparators(
  rows: VisibilityRow[],
  currentDate: string,
): SeparatorInsertion[] {
  const currentWeekStart = weekStartOfStr(currentDate);
  const firstEntryIndexByWeek = new Map<string, number>();

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (row.separator) continue;
    const weekStart = weekStartOfRow(row);
    if (
      weekStart === null ||
      weekStart > currentWeekStart ||
      firstEntryIndexByWeek.has(weekStart)
    ) continue;
    firstEntryIndexByWeek.set(weekStart, index);
  }

  return [...firstEntryIndexByWeek]
    .flatMap(([weekStart, index]): SeparatorInsertion[] => {
      const above = rows[index - 1];
      const aboveDate = above
        ? dateStringOf(above.date)
        : null;
      if (
        above
        && above.separator
        && aboveDate === weekStart
      ) return [];
      return [{
        sheetRow: rows[index].sheetRow,
        weekStart,
        label: spreadsheetWeekLabelFromStr(weekStart),
      }];
    })
    .sort((a, b) => b.sheetRow - a.sheetRow);
}

function visibleForRow(
  row: VisibilityRow,
  currentWeekStart: string,
): boolean {
  const weekStart = weekStartOfRow(row);
  if (weekStart === null) return true;
  if (weekStart >= currentWeekStart) return true;

  const tier = weekTierFromStr(weekStart, currentWeekStart);
  if (tier === "current") return true;
  if (tier === "recent") {
    return row.separator;
  }
  return false;
}

/**
 * Classifies every post-insertion row and coalesces adjacent rows that need
 * the same visibility state into one range-shaped repository operation.
 */
export function planVisibilityRanges(
  rows: VisibilityRow[],
  currentDate: string,
): VisibilityRange[] {
  const currentWeekStart = weekStartOfStr(currentDate);
  const ranges: VisibilityRange[] = [];

  rows.forEach((row, index) => {
    const visible = visibleForRow(row, currentWeekStart);
    const previous = ranges[ranges.length - 1];
    if (previous && previous.visible === visible) {
      previous.numRows++;
      return;
    }
    ranges.push({
      sheetRow: row.sheetRow,
      numRows: 1,
      visible,
    });
  });

  return ranges;
}

/**
 * Applies the two required snapshot phases. Separators shift sheet rows, so
 * visibility must always be planned from a fresh post-insertion snapshot.
 */
export function maintainVisibility(
  repo: VisibilityRepository,
  currentDate: string,
): void {
  const separatorPlan = planMissingSeparators(repo.readRows(), currentDate);
  separatorPlan.forEach(({ sheetRow, weekStart, label }) =>
    repo.insertSeparatorRow(sheetRow, weekStart, label)
  );

  const visibilityPlan = planVisibilityRanges(repo.readRows(), currentDate);
  visibilityPlan.forEach(({ sheetRow, numRows, visible }) =>
    repo.setRowVisibility(sheetRow, numRows, visible)
  );
}
