import { describe, expect, it, vi } from "vitest";
import {
  maintainVisibility,
  planMissingSeparators,
  planVisibilityRanges,
} from "./visibility";
import type { IoRow } from "./repository";

const CURRENT_DATE = "2026-02-08";
const formatDate = (raw: unknown) => String(raw);
const entry = (date: string, id: number): IoRow => [date, "Dining", "FOOD", "", "O", 1, id, ""];
const separator = (weekStart: string): IoRow => [weekStart, "", "", "", "", "", "", ""];

describe("planMissingSeparators", () => {
  it("returns no work for an empty sheet", () => {
    expect(planMissingSeparators([], CURRENT_DATE, formatDate)).toEqual([]);
  });

  it("plans every missing completed week in descending row order and never separates current or future weeks", () => {
    const rows = [
      entry("2026-01-05", 1),
      entry("2026-01-12", 2),
      entry("2026-02-08", 3),
      entry("2026-02-15", 4),
    ];

    expect(planMissingSeparators(rows, CURRENT_DATE, formatDate)).toEqual([
      { sheetRow: 3, weekStart: "2026-01-11", label: "JAN 11-17" },
      { sheetRow: 2, weekStart: "2026-01-04", label: "JAN 4-10" },
    ]);
  });

  it("skips missing, blank, and malformed dates and leaves an already-separated week alone", () => {
    const rows = [
      ["", "", "", "", "", "", 1, ""],
      entry("not-a-date", 2),
      separator("2026-01-11"),
      entry("2026-01-12", 3),
    ];

    expect(planMissingSeparators(rows, CURRENT_DATE, formatDate)).toEqual([]);
  });

  it("adds a separator before a backdated Entry even when that week's old separator remains later", () => {
    const rows = [
      separator("2026-01-04"),
      entry("2026-01-10", 1),
      entry("2026-01-11", 2), // backdated entry inserted before this separator
      separator("2026-01-11"),
      entry("2026-01-12", 3),
    ];

    expect(planMissingSeparators(rows, CURRENT_DATE, formatDate)).toEqual([
      { sheetRow: 4, weekStart: "2026-01-11", label: "JAN 11-17" },
    ]);
  });
});

describe("planVisibilityRanges", () => {
  it("keeps current rows visible, only recent separators visible, hides old rows, and coalesces ranges", () => {
    const rows = [
      entry("2026-02-08", 1),
      separator("2026-01-11"),
      entry("2026-01-12", 2),
      separator("2026-01-04"),
      entry("2026-01-05", 3),
      ["", "", "", "", "", "", 4, ""],
    ];

    expect(planVisibilityRanges(rows, CURRENT_DATE, formatDate)).toEqual([
      { sheetRow: 2, numRows: 2, visible: true },
      { sheetRow: 4, numRows: 3, visible: false },
      { sheetRow: 7, numRows: 1, visible: true },
    ]);
  });

  it("keeps future and malformed-date rows visible", () => {
    const rows = [
      entry("2026-02-15", 1),
      entry("not-a-date", 2),
    ];

    expect(planVisibilityRanges(rows, CURRENT_DATE, formatDate)).toEqual([
      { sheetRow: 2, numRows: 2, visible: true },
    ]);
  });
});

describe("maintainVisibility", () => {
  it("uses exactly two snapshots, applies stable separator coordinates, and sends coalesced visibility ranges", () => {
    const rows: IoRow[] = [
      entry("2026-01-05", 1),
      entry("2026-01-12", 2),
      entry("2026-02-08", 3),
    ];
    const readRows = vi.fn(() => rows);
    const insertSeparatorRow = vi.fn((sheetRow: number, weekStart: string, label: string) => {
      rows.splice(sheetRow - 2, 0, [weekStart, "", "", label, "", "", "", ""]);
    });
    const setRowVisibility = vi.fn();

    maintainVisibility({ readRows, insertSeparatorRow, setRowVisibility }, CURRENT_DATE, formatDate);

    expect(readRows).toHaveBeenCalledTimes(2);
    expect(insertSeparatorRow).toHaveBeenNthCalledWith(1, 3, "2026-01-11", "JAN 11-17");
    expect(insertSeparatorRow).toHaveBeenNthCalledWith(2, 2, "2026-01-04", "JAN 4-10");
    expect(setRowVisibility).toHaveBeenCalledTimes(4);
    expect(setRowVisibility).toHaveBeenNthCalledWith(1, 2, 2, false);
    expect(setRowVisibility).toHaveBeenNthCalledWith(2, 4, 1, true);
    expect(setRowVisibility).toHaveBeenNthCalledWith(3, 5, 1, false);
    expect(setRowVisibility).toHaveBeenNthCalledWith(4, 6, 1, true);
  });
});
