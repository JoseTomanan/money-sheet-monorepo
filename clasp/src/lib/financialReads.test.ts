import { describe, expect, it } from "vitest";
import { getMaster, getStats, type FinancialSheet } from "./infrastructure/financialReads";
import { CATEGORY_ORDER } from "./domain/category";
import { SHEET_LAYOUT } from "./infrastructure/sheetLayout";
import { dispatch, type DispatchDeps } from "./application/dispatch";

// A controlled Sheets adapter returns evaluated cells, not formula source text.
function sheet(rows: unknown[][]): FinancialSheet {
  return {
    getLastRow: () => rows.length,
    getLastColumn: () => Math.max(0, ...rows.map(row => row.length)),
    getRange: (row: number, col: number, height: number, width: number) => ({
      getValues: () => Array.from({ length: height }, (_, r) =>
        Array.from({ length: width }, (_, c) => rows[row - 1 + r]?.[col - 1 + c] ?? "")),
    }),
  } as FinancialSheet;
}
function masterRows(): unknown[][] {
  return [[], ["", "ON HAND", ...CATEGORY_ORDER], ["", "-12.5", 0, "0", -2, " 3.5 ", 4, 5, 6]];
}
function statsRows(): unknown[][] {
  const rows: unknown[][] = Array.from({ length: SHEET_LAYOUT.stats.rows.windowCategoryLast }, () => []);
  const anchors = SHEET_LAYOUT.stats.rows;
  CATEGORY_ORDER.forEach((category, i) => { rows[anchors.categoryFirst - 1 + i] = [category, "0", -2, "2"]; });
  for (let day = 1; day <= 31; day++) rows[anchors.paceFirst + day - 2] = [day, 0, "-1.5"];
  ["30d", "3mo", "12mo"].forEach((window, w) => {
    rows[anchors.windowTotalsFirst - 1 + w] = [window, 0, "2", -2];
    CATEGORY_ORDER.forEach((category, c) => {
      rows[anchors.windowCategoryFirst - 1 + w * CATEGORY_ORDER.length + c] = [window, category, "0"];
    });
  });
  return rows;
}

describe("financial read boundary", () => {
  it.each(["ON HAND", ...CATEGORY_ORDER])("requires MASTER %s before publishing a snapshot", missing => {
    const rows = masterRows();
    rows[1][rows[1].indexOf(missing)] = "";
    expect(() => getMaster(sheet(rows))).toThrow(/MASTER/);
  });
  it.each([
    [SHEET_LAYOUT.stats.rows.categoryFirst, 1],
    [SHEET_LAYOUT.stats.rows.paceFirst, 1],
    [SHEET_LAYOUT.stats.rows.windowTotalsFirst, 2],
    [SHEET_LAYOUT.stats.rows.windowCategoryFirst, 2],
  ])("rejects formula errors in the STATS block at row %i", (row, column) => {
    const rows = statsRows();
    rows[row - 1][column] = "#REF!";
    expect(() => getStats(sheet(rows))).toThrow(/STATS/);
  });

  it.each([
    SHEET_LAYOUT.stats.rows.categoryFirst,
    SHEET_LAYOUT.stats.rows.paceFirst,
    SHEET_LAYOUT.stats.rows.windowTotalsFirst,
    SHEET_LAYOUT.stats.rows.windowCategoryFirst,
  ])("rejects a missing required STATS row at %i", row => {
    const rows = statsRows();
    rows[row - 1] = [];
    expect(() => getStats(sheet(rows))).toThrow(/STATS/);
  });

  it.each([28, 29, 30, 31])("accepts %i evaluated pace days and skips formula-suppressed tail values", days => {
    const rows = statsRows();
    for (let day = days + 1; day <= 31; day++) rows[SHEET_LAYOUT.stats.rows.paceFirst + day - 2] = [day, "", ""];
    const stats = getStats(sheet(rows));
    expect(stats.spendingPace).toHaveLength(days);
    expect(stats.spendingPace[0]).toEqual({ day: 1, cumulativeThisMonth: 0, cumulativeUsual: -1.5 });
    expect(stats.categoryMonthChange[0]).toEqual({ category: "HOUSING", incoming: 0, outgoing: -2, netChange: 2 });
    expect(stats.windowTotals[0]).toEqual({ window: "30d", incoming: 0, outgoing: 2, net: -2 });
    expect(stats.windowCategorySpend).toHaveLength(21);
  });

  it("reports missing legacy STATS as unavailable through dispatch", () => {
    const response = dispatch({ action: "getStats", secret: undefined, body: {} }, {
      getStats: () => getStats(null),
    } as DispatchDeps);
    expect(response).toMatchObject({ ok: false, code: "internal", message: expect.stringMatching(/STATS.*unavailable|unavailable.*STATS/) });
    expect(response).not.toHaveProperty("stats");
  });

  it.each(["#REF!", "#N/A", "text", "", "   ", null, undefined, true, false, NaN, Infinity, -Infinity, [], new Date()])(
    "rejects malformed required numeric cells (%s) in both readers", value => {
      const master = masterRows();
      master[2][1] = value;
      expect(() => getMaster(sheet(master))).toThrow(/MASTER/);
      const stats = statsRows();
      stats[SHEET_LAYOUT.stats.rows.categoryFirst - 1][1] = value;
      expect(() => getStats(sheet(stats))).toThrow(/STATS/);
    });

  it("reads valid MASTER zero, negatives and numeric strings at fixed anchors, ignoring optional detail cells", () => {
    const rows = masterRows();
    rows[1].push("I", "O", "");
    rows[2].push("#N/A", "", "#REF!");
    rows.push([999999]);
    expect(getMaster(sheet(rows))).toEqual({ onHand: -12.5, budgets: {
      HOUSING: 0, FOOD: 0, TRANSIT: -2, HEALTH: 3.5, FINANCE: 4, LIFESTYLE: 5, MISC: 6,
    } });
  });

  it("rejects an absent MASTER formula row and duplicate financial headers", () => {
    expect(() => getMaster(sheet(masterRows().slice(0, 2)))).toThrow(/MASTER/);
    const rows = masterRows();
    rows[1].push("ON HAND"); rows[2].push(5);
    expect(() => getMaster(sheet(rows))).toThrow(/duplicate MASTER/);
  });

  it.each(["categories", "windows", "window categories", "pace day", "partial pace blank", "pace hole"]) (
    "rejects malformed STATS identifiers or incomplete data: %s", defect => {
      const rows = statsRows();
      const a = SHEET_LAYOUT.stats.rows;
      if (defect === "categories") rows[a.categoryFirst][0] = "HOUSING";
      if (defect === "windows") rows[a.windowTotalsFirst - 1][0] = "unknown";
      if (defect === "window categories") rows[a.windowCategoryFirst][1] = "HOUSING";
      if (defect === "pace day") rows[a.paceFirst - 1][0] = "#REF!";
      if (defect === "partial pace blank") rows[a.paceLast - 1][1] = "";
      if (defect === "pace hole") rows[a.paceLast - 2] = [30, "", ""];
      expect(() => getStats(sheet(rows))).toThrow(/STATS/);
    });

  it.each(["getMaster", "getStats"])("never publishes financial formula errors as a successful %s response", action => {
    const master = masterRows(); master[2][1] = "#REF!";
    const stats = statsRows(); stats[SHEET_LAYOUT.stats.rows.windowTotalsFirst - 1][1] = "#N/A";
    const response = dispatch({ action, secret: undefined, body: {} }, {
      getMaster: () => getMaster(sheet(master)), getStats: () => getStats(sheet(stats)),
    } as DispatchDeps);
    expect(response).toMatchObject({ ok: false, code: "internal", message: expect.stringContaining("unavailable") });
  });

});
