import { describe, it, expect, vi } from "vitest";
import {
  ensureStatsSheet,
  categoryMonthChangeFormulas,
  spendingPaceFormulas,
  windowTotalFormulas,
  windowCategorySpendFormulas,
  STATS_CATEGORIES,
  STATS_WINDOWS,
  PACE_DAYS,
} from "./infrastructure/stats";
import { SHEET_LAYOUT } from "./infrastructure/sheetLayout";

// ---------------------------------------------------------------------------
// SHEET_LAYOUT.stats.rows — fixed anchor rows
// ---------------------------------------------------------------------------

describe("SHEET_LAYOUT STATS rows", () => {
  it("lays out the category block starting at row 3, one row per category", () => {
    const rows = SHEET_LAYOUT.stats.rows;
    expect(rows.categoryHeader).toBe(2);
    expect(rows.categoryFirst).toBe(3);
    expect(rows.categoryLast).toBe(rows.categoryFirst + STATS_CATEGORIES.length - 1);
  });

  it("lays out the pace block after a separator row, spanning PACE_DAYS rows", () => {
    const rows = SHEET_LAYOUT.stats.rows;
    expect(rows.paceSeparator).toBe(rows.categoryLast + 1);
    expect(rows.paceHeader).toBe(rows.paceSeparator + 1);
    expect(rows.paceFirst).toBe(rows.paceHeader + 1);
    expect(rows.paceLast).toBe(rows.paceFirst + PACE_DAYS - 1);
  });
});

// ---------------------------------------------------------------------------
// #132 rolling-window anchor rows (appended after #129)
// ---------------------------------------------------------------------------

describe("SHEET_LAYOUT STATS window rows", () => {
  it("lays out the window-totals block right after the pace block, one row per STATS_WINDOWS entry", () => {
    const rows = SHEET_LAYOUT.stats.rows;
    expect(rows.windowSeparator).toBe(rows.paceLast + 1);
    expect(rows.windowTotalsHeader).toBe(rows.windowSeparator + 1);
    expect(rows.windowTotalsFirst).toBe(rows.windowTotalsHeader + 1);
    expect(rows.windowTotalsLast).toBe(rows.windowTotalsFirst + STATS_WINDOWS.length - 1);
  });

  it("lays out the window-category-spend block after its own separator, spanning windows x categories rows", () => {
    const rows = SHEET_LAYOUT.stats.rows;
    expect(rows.windowCategorySeparator).toBe(rows.windowTotalsLast + 1);
    expect(rows.windowCategoryHeader).toBe(rows.windowCategorySeparator + 1);
    expect(rows.windowCategoryFirst).toBe(rows.windowCategoryHeader + 1);
    expect(rows.windowCategoryLast).toBe(
      rows.windowCategoryFirst + STATS_WINDOWS.length * STATS_CATEGORIES.length - 1
    );
  });

  it("STATS_WINDOWS has exactly the 30d/3mo/12mo trio, capped at ~1 year", () => {
    expect(STATS_WINDOWS.map((w) => w.key)).toEqual(["30d", "3mo", "12mo"]);
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
// windowTotalFormulas
// ---------------------------------------------------------------------------

describe("windowTotalFormulas", () => {
  it("bounds both sums to the given window start through TODAY()", () => {
    const { incoming, outgoing } = windowTotalFormulas(45, "TODAY()-30");
    expect(incoming).toContain('">="&TODAY()-30');
    expect(incoming).toContain('"<="&TODAY()');
    expect(outgoing).toContain('">="&TODAY()-30');
  });

  it("incoming sums direction I, outgoing sums direction O", () => {
    const { incoming, outgoing } = windowTotalFormulas(45, "EDATE(TODAY(),-3)");
    expect(incoming).toContain('"I"');
    expect(outgoing).toContain('"O"');
  });

  it("net formula subtracts outgoing (col C) from incoming (col B) on the same row", () => {
    const { net } = windowTotalFormulas(47, "EDATE(TODAY(),-12)");
    expect(net).toBe("=B47-C47");
  });
});

// ---------------------------------------------------------------------------
// windowCategorySpendFormulas
// ---------------------------------------------------------------------------

describe("windowCategorySpendFormulas", () => {
  it("references the category's own row for the tag lookup ($B{row})", () => {
    const { outgoing } = windowCategorySpendFormulas(50, "TODAY()-30");
    expect(outgoing).toContain("$B50");
  });

  it("sums only outgoing, bounded to the given window start through TODAY()", () => {
    const { outgoing } = windowCategorySpendFormulas(50, "EDATE(TODAY(),-3)");
    expect(outgoing).toContain('"O"');
    expect(outgoing).toContain('">="&EDATE(TODAY(),-3)');
    expect(outgoing).toContain('"<="&TODAY()');
  });
});

describe("formula regression", () => {
  it("keeps every generated formula byte-for-byte unchanged", () => {
    expect(categoryMonthChangeFormulas(3)).toEqual({
      incoming: `=SUMIFS('INCOMING/OUTGOING'!$G:$G,'INCOMING/OUTGOING'!$F:$F,"I",'INCOMING/OUTGOING'!$D:$D,$A3,'INCOMING/OUTGOING'!$B:$B,">="&EOMONTH(TODAY(),-1)+1,'INCOMING/OUTGOING'!$B:$B,"<="&EOMONTH(TODAY(),0))`,
      outgoing: `=SUMIFS('INCOMING/OUTGOING'!$G:$G,'INCOMING/OUTGOING'!$F:$F,"O",'INCOMING/OUTGOING'!$D:$D,$A3,'INCOMING/OUTGOING'!$B:$B,">="&EOMONTH(TODAY(),-1)+1,'INCOMING/OUTGOING'!$B:$B,"<="&EOMONTH(TODAY(),0))`,
      net: "=B3-C3",
    });
    expect(spendingPaceFormulas(12)).toEqual({
      thisMonth: `=IF($A12>DAY(EOMONTH(TODAY(),0)),"",SUMIFS('INCOMING/OUTGOING'!$G:$G,'INCOMING/OUTGOING'!$F:$F,"O",'INCOMING/OUTGOING'!$B:$B,">="&EOMONTH(TODAY(),-1)+1,'INCOMING/OUTGOING'!$B:$B,"<="&MIN(EOMONTH(TODAY(),-1)+$A12,TODAY())))`,
      usual: `=IF($A12>DAY(EOMONTH(TODAY(),0)),"",IFERROR(AVERAGE(SUMIFS('INCOMING/OUTGOING'!$G:$G,'INCOMING/OUTGOING'!$F:$F,"O",'INCOMING/OUTGOING'!$B:$B,">="&EOMONTH(TODAY(),-1)+1,'INCOMING/OUTGOING'!$B:$B,"<="&MIN(EOMONTH(TODAY(),-1)+$A12,EOMONTH(TODAY(),-0))),SUMIFS('INCOMING/OUTGOING'!$G:$G,'INCOMING/OUTGOING'!$F:$F,"O",'INCOMING/OUTGOING'!$B:$B,">="&EOMONTH(TODAY(),-2)+1,'INCOMING/OUTGOING'!$B:$B,"<="&MIN(EOMONTH(TODAY(),-2)+$A12,EOMONTH(TODAY(),-1))),SUMIFS('INCOMING/OUTGOING'!$G:$G,'INCOMING/OUTGOING'!$F:$F,"O",'INCOMING/OUTGOING'!$B:$B,">="&EOMONTH(TODAY(),-3)+1,'INCOMING/OUTGOING'!$B:$B,"<="&MIN(EOMONTH(TODAY(),-3)+$A12,EOMONTH(TODAY(),-2)))),0))`,
    });
    expect(windowTotalFormulas(45, "TODAY()-30")).toEqual({
      incoming: `=SUMIFS('INCOMING/OUTGOING'!$G:$G,'INCOMING/OUTGOING'!$F:$F,"I",'INCOMING/OUTGOING'!$B:$B,">="&TODAY()-30,'INCOMING/OUTGOING'!$B:$B,"<="&TODAY())`,
      outgoing: `=SUMIFS('INCOMING/OUTGOING'!$G:$G,'INCOMING/OUTGOING'!$F:$F,"O",'INCOMING/OUTGOING'!$B:$B,">="&TODAY()-30,'INCOMING/OUTGOING'!$B:$B,"<="&TODAY())`,
      net: "=B45-C45",
    });
    expect(windowCategorySpendFormulas(50, "TODAY()-30")).toEqual({
      outgoing: `=SUMIFS('INCOMING/OUTGOING'!$G:$G,'INCOMING/OUTGOING'!$F:$F,"O",'INCOMING/OUTGOING'!$D:$D,$B50,'INCOMING/OUTGOING'!$B:$B,">="&TODAY()-30,'INCOMING/OUTGOING'!$B:$B,"<="&TODAY())`,
    });
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
    expect(insertSheet).toHaveBeenCalledWith(SHEET_LAYOUT.stats.name);
  });

  it("does not insert a sheet when 'STATS' already exists", () => {
    const { ss, insertSheet } = makeSpreadsheet(makeSheet());
    ensureStatsSheet(ss);
    expect(insertSheet).not.toHaveBeenCalled();
  });

  it("writes one appendRow call per title/header/category/separator/pace/window row", () => {
    const { ss, appendRow } = makeSpreadsheet(null);
    ensureStatsSheet(ss);
    // title(1) + category header(1) + categories(N) + separator(1) + pace header(1) + pace days(31)
    // + separator(1) + window-totals header(1) + windows(W) + separator(1) + window-cat header(1) + windows*categories(W*N)
    const expectedCalls =
      1 + 1 + STATS_CATEGORIES.length + 1 + 1 + PACE_DAYS +
      1 + 1 + STATS_WINDOWS.length + 1 + 1 + STATS_WINDOWS.length * STATS_CATEGORIES.length;
    expect(appendRow).toHaveBeenCalledTimes(expectedCalls);
  });

  it("writes every STATS_WINDOWS key as a window-totals row's first column", () => {
    const { ss, appendRow } = makeSpreadsheet(null);
    ensureStatsSheet(ss);
    for (const w of STATS_WINDOWS) {
      expect(appendRow).toHaveBeenCalledWith(expect.arrayContaining([w.key]));
    }
  });

  it("writes one window-category-spend row per (window, category) pair", () => {
    const { ss, appendRow } = makeSpreadsheet(null);
    ensureStatsSheet(ss);
    for (const w of STATS_WINDOWS) {
      for (const category of STATS_CATEGORIES) {
        expect(appendRow).toHaveBeenCalledWith([w.key, category, expect.stringContaining("SUMIFS")]);
      }
    }
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
