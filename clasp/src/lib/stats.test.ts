import { describe, it, expect, vi } from "vitest";
import {
  ensureStatsSheet,
  categoryMonthChangeFormulas,
  spendingPaceFormulas,
  STATS_SHEET_NAME,
  STATS_CATEGORIES,
  STATS_ROWS,
  PACE_DAYS,
} from "./stats";

// ---------------------------------------------------------------------------
// STATS_ROWS — fixed anchor rows
// ---------------------------------------------------------------------------

describe("STATS_ROWS", () => {
  it("lays out the category block starting at row 3, one row per category", () => {
    expect(STATS_ROWS.categoryHeader).toBe(2);
    expect(STATS_ROWS.categoryFirst).toBe(3);
    expect(STATS_ROWS.categoryLast).toBe(2 + STATS_CATEGORIES.length);
  });

  it("lays out the pace block after a separator row, spanning PACE_DAYS rows", () => {
    expect(STATS_ROWS.paceSeparator).toBe(STATS_ROWS.categoryLast + 1);
    expect(STATS_ROWS.paceHeader).toBe(STATS_ROWS.paceSeparator + 1);
    expect(STATS_ROWS.paceFirst).toBe(STATS_ROWS.paceHeader + 1);
    expect(STATS_ROWS.paceLast).toBe(STATS_ROWS.paceFirst + PACE_DAYS - 1);
  });
});

// ---------------------------------------------------------------------------
// categoryMonthChangeFormulas
// ---------------------------------------------------------------------------

describe("categoryMonthChangeFormulas", () => {
  it("references the category's own row for the tag lookup ($A{row})", () => {
    const { incoming, outgoing } = categoryMonthChangeFormulas(5);
    expect(incoming).toContain("$A5");
    expect(outgoing).toContain("$A5");
  });

  it("incoming sums direction I, outgoing sums direction O", () => {
    const { incoming, outgoing } = categoryMonthChangeFormulas(3);
    expect(incoming).toContain('"I"');
    expect(outgoing).toContain('"O"');
  });

  it("bounds both sums to the current calendar month via EOMONTH(TODAY())", () => {
    const { incoming, outgoing } = categoryMonthChangeFormulas(3);
    expect(incoming).toContain("EOMONTH(TODAY(),-1)+1");
    expect(incoming).toContain("EOMONTH(TODAY(),0)");
    expect(outgoing).toContain("EOMONTH(TODAY(),-1)+1");
  });

  it("net change formula subtracts outgoing (col C) from incoming (col B) on the same row", () => {
    const { net } = categoryMonthChangeFormulas(7);
    expect(net).toBe("=B7-C7");
  });
});

// ---------------------------------------------------------------------------
// spendingPaceFormulas
// ---------------------------------------------------------------------------

describe("spendingPaceFormulas", () => {
  it("guards both formulas against days past the current month's length", () => {
    const { thisMonth, usual } = spendingPaceFormulas(20);
    expect(thisMonth).toContain("$A20>DAY(EOMONTH(TODAY(),0))");
    expect(usual).toContain("$A20>DAY(EOMONTH(TODAY(),0))");
  });

  it("this-month cumulative sums only outgoing, clamped to TODAY()", () => {
    const { thisMonth } = spendingPaceFormulas(15);
    expect(thisMonth).toContain('"O"');
    expect(thisMonth).toContain("MIN(EOMONTH(TODAY(),-1)+$A15,TODAY())");
  });

  it("usual baseline averages exactly TRAILING_MONTHS prior-month SUMIFS terms", () => {
    const { usual } = spendingPaceFormulas(15);
    const sumifsCount = (usual.match(/SUMIFS/g) ?? []).length;
    expect(sumifsCount).toBe(3); // TRAILING_MONTHS
    expect(usual).toContain("EOMONTH(TODAY(),-1)+$A15");
    expect(usual).toContain("EOMONTH(TODAY(),-2)+$A15");
    expect(usual).toContain("EOMONTH(TODAY(),-3)+$A15");
  });
});

// ---------------------------------------------------------------------------
// ensureStatsSheet — fake spreadsheet helpers (mirrors config.test.ts)
// ---------------------------------------------------------------------------

function makeSheet(appendRowFn = vi.fn()) {
  return { appendRow: appendRowFn } as unknown as GoogleAppsScript.Spreadsheet.Sheet;
}

function makeSpreadsheet(existingSheet: GoogleAppsScript.Spreadsheet.Sheet | null) {
  const appendRow = vi.fn();
  const newSheet = makeSheet(appendRow);
  const insertSheet = vi.fn().mockReturnValue(newSheet);
  const getSheetByName = vi.fn().mockReturnValue(existingSheet);
  return {
    ss: { getSheetByName, insertSheet } as unknown as GoogleAppsScript.Spreadsheet.Spreadsheet,
    getSheetByName,
    insertSheet,
    appendRow,
  };
}

describe("ensureStatsSheet", () => {
  it("inserts a 'STATS' sheet when one does not exist", () => {
    const { ss, insertSheet } = makeSpreadsheet(null);
    ensureStatsSheet(ss);
    expect(insertSheet).toHaveBeenCalledWith(STATS_SHEET_NAME);
  });

  it("does not insert a sheet when 'STATS' already exists", () => {
    const { ss, insertSheet } = makeSpreadsheet(makeSheet());
    ensureStatsSheet(ss);
    expect(insertSheet).not.toHaveBeenCalled();
  });

  it("writes one appendRow call per title/header/category/separator/pace row", () => {
    const { ss, appendRow } = makeSpreadsheet(null);
    ensureStatsSheet(ss);
    // title(1) + category header(1) + categories(N) + separator(1) + pace header(1) + pace days(31)
    const expectedCalls = 1 + 1 + STATS_CATEGORIES.length + 1 + 1 + PACE_DAYS;
    expect(appendRow).toHaveBeenCalledTimes(expectedCalls);
  });

  it("writes every STATS_CATEGORIES entry as a category row's first column", () => {
    const { ss, appendRow } = makeSpreadsheet(null);
    ensureStatsSheet(ss);
    for (const category of STATS_CATEGORIES) {
      expect(appendRow).toHaveBeenCalledWith(expect.arrayContaining([category]));
    }
  });

  it("writes day numbers 1..31 as the first column of pace rows", () => {
    const { ss, appendRow } = makeSpreadsheet(null);
    ensureStatsSheet(ss);
    const dayRowCalls = appendRow.mock.calls.filter((call) => typeof call[0][0] === "number");
    const days = dayRowCalls.map((call) => call[0][0]).sort((a, b) => a - b);
    expect(days).toEqual(Array.from({ length: PACE_DAYS }, (_, i) => i + 1));
  });
});
