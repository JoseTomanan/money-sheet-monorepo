// STATS sheet reader — formula-driven, GAS read-only (mirrors 3_master.ts /
// MASTER; see docs/adr/0011 and lib/stats.ts for the full layout doc + the
// exact formulas written into the sheet by ensureStatsSheet).
//
// Fixed anchor rows (STATS_ROWS, from lib/stats.ts) locate the two data
// blocks — never use getLastRow() to find them, same invariant as MASTER's
// "always row 3" (extra rows appended below would shift getLastRow() past
// the real data).
function getStats(): StatsData {
  const sh = getStatsSheetOrNull();
  if (!sh) return { categoryMonthChange: [], spendingPace: [] };

  const categoryRowCount = STATS_ROWS.categoryLast - STATS_ROWS.categoryFirst + 1;
  const categoryRows = sh.getRange(STATS_ROWS.categoryFirst, 1, categoryRowCount, 4).getValues();
  const categoryMonthChange: CategoryMonthChange[] = categoryRows
    .filter((row) => String(row[0]).trim() !== "")
    .map((row) => ({
      category: String(row[0]).trim(),
      incoming: Number(row[1]) || 0,
      outgoing: Number(row[2]) || 0,
      netChange: Number(row[3]) || 0,
    }));

  const paceRowCount = STATS_ROWS.paceLast - STATS_ROWS.paceFirst + 1;
  const paceRows = sh.getRange(STATS_ROWS.paceFirst, 1, paceRowCount, 3).getValues();
  const spendingPace: SpendingPaceDay[] = paceRows
    .filter((row) => row[0] !== "" && row[0] !== null)
    .map((row) => ({
      day: Number(row[0]) || 0,
      cumulativeThisMonth: Number(row[1]) || 0,
      cumulativeUsual: Number(row[2]) || 0,
    }));

  return { categoryMonthChange, spendingPace };
}
