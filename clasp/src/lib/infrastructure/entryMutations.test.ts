import { afterEach, expect, it, vi } from "vitest";
import { dispatch, type DispatchDeps } from "../application/dispatch";
import { addEntry, addEntries, updateEntry, deleteEntry, getEntries } from "./entries";

afterEach(() => vi.unstubAllGlobals());

/** GAS boundary stand-in: all application, repository, and lock glue is real. */
function liveCaller() {
  const rows: unknown[][] = [["2026-09-15", "FOOD", "FOOD", "Lunch", "O", 100, 1, "original"]];
  let locked = false;
  let beforeLock: (() => void) | undefined;
  let persistenceError: Error | undefined;
  const properties = new Map<string, string>();
  const sheet = {
    getLastRow: () => { if (persistenceError) throw persistenceError; return rows.length + 1; },
    getMaxRows: () => 1000,
    getParent: () => ({ getId: () => "test-sheet" }),
    getRange: (row: number, col: number, count = 1, width = 1) => ({
      row, col,
      copyTo: (destination: { row: number; col: number }) => {
        expect(locked).toBe(true);
        expect(col === 4 || (col < 4 && col + width > 4)).toBe(false);
        const values = rows.slice(row - 2, row - 2 + count).map((r) => r.slice(col - 2, col - 2 + width));
        values.forEach((r, i) => {
          const target = rows[destination.row - 2 + i] ?? (rows[destination.row - 2 + i] = Array(8).fill(""));
          r.forEach((v, j) => { target[destination.col - 2 + j] = v; });
        });
      },
      clearContent: () => {
        expect(locked).toBe(true);
        expect(col === 4 || (col < 4 && col + width > 4)).toBe(false);
        rows[row - 2]?.fill("", col - 2, col - 2 + width);
      },
      getValues: () => {
        expect(locked).toBe(true);
        if (persistenceError) throw persistenceError;
        return rows.slice(row - 2, row - 2 + count).map((values) => values.map((value, index) => index === 2 ? "FOOD" : value).slice(col - 2, col - 2 + width));
      },
      getValue: () => { rows[row - 2][2] = "FOOD"; return "FOOD"; },
      setValues: (values: unknown[][]) => {
        expect(locked).toBe(true);
        expect(col === 4 || (col < 4 && col + width > 4)).toBe(false);
        const target = rows[row - 2] ?? (rows[row - 2] = Array(8).fill(""));
        values[0].forEach((value, index) => { target[col - 2 + index] = value; });
      },
    }),
    deleteRow: (row: number) => { expect(locked).toBe(true); rows.splice(row - 2, 1); },
    insertRowBefore: (row: number) => { expect(locked).toBe(true); rows.splice(row - 2, 0, Array(8).fill("")); },
  };
  const categories = { FOOD: ["Dining"] };
  vi.stubGlobal("SpreadsheetApp", {
    getActiveSpreadsheet: () => ({ getSheetByName: (name: string) => name === "Categories" ? {
      getLastRow: () => 2, getRange: () => ({ getValues: () => [["Dining", "FOOD"]] }),
    } : sheet }), flush: () => {},
  });
  vi.stubGlobal("Utilities", { formatDate: (date: unknown) => String(date) });
  vi.stubGlobal("PropertiesService", { getScriptProperties: () => ({
    getProperty: (key: string) => properties.get(key) ?? null,
    setProperty: (key: string, value: string) => { properties.set(key, value); },
    setProperties: (values: Record<string, string>) => Object.entries(values).forEach(([key, value]) => properties.set(key, value)),
  }) });
  vi.stubGlobal("LockService", { getDocumentLock: () => ({
    waitLock: () => {
      const intervene = beforeLock;
      beforeLock = undefined;
      intervene?.();
      expect(locked).toBe(false);
      locked = true;
    },
    releaseLock: () => { locked = false; },
  }) });
  const deps: DispatchDeps = { secret: "secret", getCategories: () => categories,
    addEntry, addEntries, updateEntry, deleteEntry };
  return {
    call: (action: string, body: Record<string, unknown>) => dispatch({ action, secret: "secret", body }, deps),
    intervene: (work: () => void) => { beforeLock = work; },
    fail: (error: Error) => { persistenceError = error; },
    read: () => { locked = true; try { return getEntries(); } finally { locked = false; } },
  };
}

it("live caller validates the Entry observed after acquiring the shared document lock", () => {
  const live = liveCaller();
  live.intervene(() => expect(live.call("updateEntry", { id: 1, tag: "Dining" })).toEqual({ ok: true }));
  expect(live.call("updateEntry", { id: 1, direction: "I" })).toMatchObject({ ok: false, code: "validation" });
  expect(live.read()[0]).toMatchObject({ tag: "Dining", direction: "O", amount: 100 });
});

it("live caller returns not_found for an Entry removed before the transaction and keeps storage errors internal", () => {
  const live = liveCaller();
  live.intervene(() => expect(live.call("deleteEntry", { id: 1 })).toEqual({ ok: true }));
  expect(live.call("updateEntry", { id: 1, description: "Edit" })).toMatchObject({ ok: false, code: "not_found" });
  expect(live.call("deleteEntry", { id: 1 })).toMatchObject({ ok: false, code: "not_found" });
  live.fail(new Error("Storage service not found"));
  expect(live.call("deleteEntry", { id: 1 })).toMatchObject({ ok: false, code: "internal", message: "Storage service not found" });
});

it("live caller preserves single and ordered batch replay, mismatches, and atomic validation", () => {
  const live = liveCaller();
  const first = { date: "2026-09-17", tag: "FOOD", description: "First", direction: "I", amount: 100 };
  const second = { ...first, date: "2026-09-16", description: "^^", amount: 50 };
  const single = { ...first, mutationId: "single" };
  const added = live.call("addEntry", single);
  expect(added).toMatchObject({ ok: true, entry: { id: 2 } });
  expect(live.call("addEntry", single)).toEqual(added);
  expect(live.call("addEntry", { ...single, amount: 101 })).toMatchObject({ ok: false, code: "validation" });
  const batch = { entries: [first, second], mutationId: "batch" };
  const result = live.call("addEntries", batch);
  expect(result).toMatchObject({ ok: true, entries: [{ id: 3, row: 4 }, { id: 4, row: 3 }] });
  const replay = live.call("addEntries", batch);
  expect(replay).toMatchObject({ ok: true, entries: [
    { id: 3, date: first.date, description: first.description, amount: first.amount, mainCategory: "FOOD" },
    { id: 4, date: second.date, description: second.description, amount: second.amount, mainCategory: "FOOD" },
  ] });
  expect(live.call("addEntry", { ...first, mutationId: "batch" })).toMatchObject({ ok: false, code: "validation" });
  expect(live.call("addEntries", { ...batch, mutationId: "single" })).toMatchObject({ ok: false, code: "validation" });
  expect(live.call("addEntries", { ...batch, entries: [first, { ...second, amount: 51 }] })).toMatchObject({ ok: false, code: "validation" });
  expect(live.call("addEntries", { ...batch, mutationId: "invalid", entries: [first, { ...second, tag: "Dining" }] })).toMatchObject({ ok: false, code: "validation" });
  expect(live.read().map((entry) => entry.id)).toEqual([1, 4, 2, 3]);
});
