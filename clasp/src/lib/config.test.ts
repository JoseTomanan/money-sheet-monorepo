import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseConfigRows, ensureConfigSheet } from "./config";

// ---------------------------------------------------------------------------
// parseConfigRows
// ---------------------------------------------------------------------------

describe("parseConfigRows", () => {
  it("maps a single key-value row to a plain object", () => {
    expect(parseConfigRows([["currency", "₱"]])).toEqual({ currency: "₱" });
  });

  it("maps multiple rows to separate keys", () => {
    expect(parseConfigRows([["currency", "₱"], ["theme", "dark"]])).toEqual({
      currency: "₱",
      theme: "dark",
    });
  });

  it("trims whitespace from both key and value", () => {
    expect(parseConfigRows([["  currency  ", "  €  "]])).toEqual({ currency: "€" });
  });

  it("skips rows with an empty key after trimming", () => {
    expect(parseConfigRows([["", "ignored"], ["currency", "₱"]])).toEqual({ currency: "₱" });
  });

  it("keeps rows with an empty value (value is preserved as-is)", () => {
    expect(parseConfigRows([["currency", ""]])).toEqual({ currency: "" });
  });

  it("returns an empty object for an empty array", () => {
    expect(parseConfigRows([])).toEqual({});
  });

  it("coerces non-string cells to strings", () => {
    expect(parseConfigRows([[42, true]])).toEqual({ "42": "true" });
  });
});

// ---------------------------------------------------------------------------
// ensureConfigSheet — fake spreadsheet helpers
// ---------------------------------------------------------------------------

function makeSheet(appendRowFn = vi.fn()) {
  return { appendRow: appendRowFn } as unknown as GoogleAppsScript.Spreadsheet.Sheet;
}

function makeSpreadsheet(existingSheet: GoogleAppsScript.Spreadsheet.Sheet | null) {
  const insertSheet = vi.fn().mockReturnValue(makeSheet());
  const getSheetByName = vi.fn().mockReturnValue(existingSheet);
  return {
    ss: { getSheetByName, insertSheet } as unknown as GoogleAppsScript.Spreadsheet.Spreadsheet,
    getSheetByName,
    insertSheet,
  };
}

describe("ensureConfigSheet", () => {
  it("inserts a 'Config' sheet when one does not exist", () => {
    const { ss, insertSheet } = makeSpreadsheet(null);
    ensureConfigSheet(ss);
    expect(insertSheet).toHaveBeenCalledWith("Config");
  });

  it("seeds the new sheet with the default currency row", () => {
    const appendRow = vi.fn();
    const newSheet = makeSheet(appendRow);
    const ss = {
      getSheetByName: vi.fn().mockReturnValue(null),
      insertSheet: vi.fn().mockReturnValue(newSheet),
    } as unknown as GoogleAppsScript.Spreadsheet.Spreadsheet;

    ensureConfigSheet(ss);

    expect(appendRow).toHaveBeenCalledWith(["currency", "₱"]);
  });

  it("does not insert a sheet when 'Config' already exists", () => {
    const { ss, insertSheet } = makeSpreadsheet(makeSheet());
    ensureConfigSheet(ss);
    expect(insertSheet).not.toHaveBeenCalled();
  });

  it("accepts custom default rows", () => {
    const appendRow = vi.fn();
    const newSheet = makeSheet(appendRow);
    const ss = {
      getSheetByName: vi.fn().mockReturnValue(null),
      insertSheet: vi.fn().mockReturnValue(newSheet),
    } as unknown as GoogleAppsScript.Spreadsheet.Spreadsheet;

    ensureConfigSheet(ss, [["currency", "$"], ["locale", "en-US"]]);

    expect(appendRow).toHaveBeenCalledTimes(2);
    expect(appendRow).toHaveBeenNthCalledWith(1, ["currency", "$"]);
    expect(appendRow).toHaveBeenNthCalledWith(2, ["locale", "en-US"]);
  });
});
