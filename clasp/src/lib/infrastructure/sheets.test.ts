import { afterEach, expect, it, vi } from "vitest";
import { insertEntry, insertEntries, patchEntry, removeEntry } from "./entryRepository";
import { liveIoRepository } from "./sheets";
import { applyRowVisibilityForActiveSheet } from "./visibility";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const formula = '=ARRAYFORMULA(IF(C2:C="","",C2:C))';
const entry = (date: string, id: number) => [date, "FOOD", "", `Entry ${id}`, "I", id, id, `key-${id}`];
const payload = (date: string) => ({ date, tag: "FOOD", description: "New", direction: "I" as const, amount: 10 });

/** Models physical cells, including D2; formula evaluation itself belongs to Sheets. */
function sheetFixture(initial = [entry("2026-09-15", 1), entry("2026-09-17", 2)], spareRows = 3) {
  const cells = [["DATE", "TAG", "MAIN CATEGORY", "DESCRIPTION", "I/O", "AMOUNT", "ENTRY ID", "MUTATION ID"],
    ...initial.map((row) => [...row]), ...Array.from({ length: spareRows }, () => Array(8).fill(""))];
  cells[1][2] = formula;
  const styles = cells.map(() => Array(8).fill("normal"));
  const mutations: [number, number][] = [];
  const assertWritable = (col: number, width: number) => {
    mutations.push([col, width]);
    expect(col <= 4 && col + width > 4).toBe(false);
  };
  const lastRow = () => cells.reduce((last, row, index) => row.some((v) => v !== "") ? index + 1 : last, 1);
  function range(row: number, col: number, count = 1, width = 1) {
    return {
      row, col,
      getValues: () => cells.slice(row - 1, row - 1 + count).map((values) =>
        values.slice(col - 2, col - 2 + width).map((value, index) =>
          col + index === 4 ? (values[1] ? "FOOD" : "") : value)),
      getValue: () => col === 4 ? (cells[row - 1][1] ? "FOOD" : "") : cells[row - 1][col - 2],
      setValues: (values: unknown[][]) => {
        assertWritable(col, width);
        values.forEach((valuesRow, i) => valuesRow.forEach((value, j) => { cells[row - 1 + i][col - 2 + j] = value; }));
      },
      setValue: (value: unknown) => { assertWritable(col, width); cells[row - 1][col - 2] = value; },
      clearContent: () => {
        assertWritable(col, width);
        for (let i = 0; i < count; i++) cells[row - 1 + i].fill("", col - 2, col - 2 + width);
      },
      copyTo: (destination: { row: number; col: number }) => {
        assertWritable(destination.col, width);
        // Snapshot first: source and destination overlap for a one-row shift.
        const values = cells.slice(row - 1, row - 1 + count).map((r) => r.slice(col - 2, col - 2 + width));
        const formats = styles.slice(row - 1, row - 1 + count).map((r) => r.slice(col - 2, col - 2 + width));
        values.forEach((r, i) => r.forEach((v, j) => { cells[destination.row - 1 + i][destination.col - 2 + j] = v; }));
        formats.forEach((r, i) => r.forEach((v, j) => { styles[destination.row - 1 + i][destination.col - 2 + j] = v; }));
      },
      setFontStyle: (style: string) => { assertWritable(col, width); styles[row - 1][col - 2] = style; },
    };
  }
  const sheet = {
    getLastRow: lastRow,
    getMaxRows: () => cells.length,
    getParent: () => ({ getId: () => "formula-fixture" }),
    getRange: range,
    insertRowsAfter: (after: number, count: number) => {
      expect(after).toBe(cells.length);
      cells.push(...Array.from({ length: count }, () => Array(8).fill("")));
      styles.push(...Array.from({ length: count }, () => Array(8).fill("normal")));
    },
    // Existing implementation uses these: accurately model D2 moving/disappearing.
    insertRowBefore: (row: number) => { cells.splice(row - 1, 0, Array(8).fill("")); },
    deleteRow: (row: number) => { cells.splice(row - 1, 1); },
    showRows: vi.fn(), hideRows: vi.fn(),
  };
  const properties = new Map<string, string>();
  vi.stubGlobal("SpreadsheetApp", { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet }), flush: vi.fn() });
  vi.stubGlobal("PropertiesService", { getScriptProperties: () => ({
    getProperty: (key: string) => properties.get(key) ?? null,
    setProperties: (values: Record<string, string>) => Object.entries(values).forEach(([k, v]) => properties.set(k, v)),
  }) });
  vi.stubGlobal("Utilities", { formatDate: (raw: unknown) => raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw) });
  vi.stubGlobal("LockService", { getDocumentLock: () => ({ waitLock: vi.fn(), releaseLock: vi.fn() }) });
  return { repo: liveIoRepository(sheet as unknown as GoogleAppsScript.Spreadsheet.Sheet), cells, styles, mutations, sheet };
}

it("inserting the earliest Entry leaves D2 and every other D cell untouched", () => {
  const { repo, cells } = sheetFixture();
  const beforeD = cells.map((r) => r[2]);
  expect(insertEntry(repo, payload("2026-09-14"), "new")).toMatchObject({ id: 3, row: 2, mainCategory: "FOOD" });
  expect(cells.map((r) => r[2])).toEqual(beforeD);
  expect(repo.readRows().slice(0, 3).map((r) => [r[6], r[7]])).toEqual([[3, "new"], [1, "key-1"], [2, "key-2"]]);
});

it("deleting the first Entry preserves D2 and clears only the final managed cells", () => {
  const { repo, cells } = sheetFixture();
  const beforeD = cells.map((r) => r[2]);
  expect(removeEntry(repo, 1)).toBe(true);
  expect(cells.map((r) => r[2])).toEqual(beforeD);
  expect(repo.readRows().map((r) => [r[6], r[7]])).toEqual([[2, "key-2"]]);
  expect(cells[2]).toEqual(Array(8).fill(""));
});

it("moving an Entry out of and back into row 2 preserves formula, IDs and Mutation IDs", () => {
  const { repo, cells } = sheetFixture();
  expect(patchEntry(repo, 1, { date: "2026-09-18" }, String)).toBe(true);
  expect(repo.readRows().map((r) => r[6])).toEqual([2, 1]);
  expect(patchEntry(repo, 1, { date: "2026-09-14" }, String)).toBe(true);
  expect(cells[1][2]).toBe(formula);
  expect(repo.readRows().map((r) => [r[6], r[7]])).toEqual([[1, "key-1"], [2, "key-2"]]);
});

it("mixed-date batch inserts preserve D2 and stored order", () => {
  const { repo, cells } = sheetFixture();
  const added = insertEntries(repo, [payload("2026-09-16"), payload("2026-09-14")], "batch");
  expect(added.map((e) => e.id)).toEqual([3, 4]);
  expect(repo.readRows().map((r) => r[6])).toEqual([4, 1, 3, 2]);
  expect(cells[1][2]).toBe(formula);
});

it("week separators use the same D-safe insertion and preserve Entry formatting", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-18T12:00:00Z"));
  const { repo, cells, styles } = sheetFixture();
  styles[1][3] = "entry-style";
  applyRowVisibilityForActiveSheet();
  expect(cells[1][2]).toBe(formula);
  expect(repo.readRows().map((r) => r[6])).toEqual(["", 1, 2]);
  expect(styles[1][3]).toBe("italic");
  expect(styles[2][3]).toBe("entry-style");
  applyRowVisibilityForActiveSheet();
  expect(repo.readRows().map((r) => r[6])).toEqual(["", 1, 2]);
});

it("grows a full grid only at the bottom before copying managed cells", () => {
  const { repo, cells } = sheetFixture(undefined, 0);
  insertEntry(repo, payload("2026-09-14"));
  expect(cells).toHaveLength(4);
  expect(cells[1][2]).toBe(formula);
  expect(repo.readRows().map((r) => r[6])).toEqual([3, 1, 2]);
});

it("appends at grid capacity without writing D", () => {
  const { repo, cells } = sheetFixture(undefined, 0);
  insertEntry(repo, payload("2026-09-18"));
  expect(cells).toHaveLength(4);
  expect(cells[1][2]).toBe(formula);
  expect(repo.readRows().map((r) => r[6])).toEqual([1, 2, 3]);
});

it("can delete the only Entry and add again while D2 stays anchored", () => {
  const { repo, cells } = sheetFixture([entry("2026-09-15", 1)]);
  removeEntry(repo, 1);
  expect(cells[1][2]).toBe(formula);
  expect(insertEntry(repo, payload("2026-09-14"))).toMatchObject({ row: 2, mainCategory: "FOOD" });
  expect(cells[1][2]).toBe(formula);
});
