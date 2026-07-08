import { describe, it, expect, vi } from "vitest";
import { isSeparatorRow, listEntries, patchEntry, removeEntry, insertEntry } from "./repository";

describe("isSeparatorRow", () => {
  it("is true for a blank Entry ID cell (empty string, null, undefined)", () => {
    expect(isSeparatorRow("")).toBe(true);
    expect(isSeparatorRow(null)).toBe(true);
    expect(isSeparatorRow(undefined)).toBe(true);
  });

  it("is false for a populated Entry ID cell", () => {
    expect(isSeparatorRow(1)).toBe(false);
    expect(isSeparatorRow("1")).toBe(false);
    expect(isSeparatorRow(0)).toBe(false);
  });
});

describe("listEntries", () => {
  it("skips separator rows and formats each entry via the injected formatDate", () => {
    const rows = [
      [new Date("2026-01-05"), "", "", "Week of Jan 5", "", "", ""], // separator
      [new Date("2026-01-06"), "FOOD", "FOOD", "Groceries", "O", 100, 1],
    ];
    const repo = { readRows: () => rows };
    const entries = listEntries(repo, (d) => (d as Date).toISOString().slice(0, 10));

    expect(entries).toEqual([
      {
        id: 1,
        date: "2026-01-06",
        tag: "FOOD",
        mainCategory: "FOOD",
        description: "Groceries",
        direction: "O",
        amount: 100,
      },
    ]);
  });
});

describe("patchEntry", () => {
  it("writes only the provided fields to the row matching the Entry ID", () => {
    const rows = [
      ["", "", "", "sep", "", "", ""],
      [new Date("2026-01-06"), "FOOD", "FOOD", "Groceries", "O", 100, 1],
    ];
    const writeEntryFields = vi.fn();
    const repo = { readRows: () => rows, writeEntryFields };

    patchEntry(repo, 1, { amount: 150, description: "Groceries (updated)" });

    expect(writeEntryFields).toHaveBeenCalledWith(3, {
      amount: 150,
      description: "Groceries (updated)",
    });
  });

  it("throws when the Entry ID does not exist", () => {
    const repo = { readRows: () => [], writeEntryFields: vi.fn() };
    expect(() => patchEntry(repo, 99, { amount: 1 })).toThrow("Entry 99 not found");
  });
});

describe("removeEntry", () => {
  it("deletes the row matching the Entry ID", () => {
    const rows = [
      ["", "", "", "sep", "", "", ""],
      [new Date("2026-01-06"), "FOOD", "FOOD", "Groceries", "O", 100, 1],
    ];
    const deleteRow = vi.fn();
    const repo = { readRows: () => rows, deleteRow };

    removeEntry(repo, 1);

    expect(deleteRow).toHaveBeenCalledWith(3);
  });

  it("throws when the Entry ID does not exist", () => {
    const repo = { readRows: () => [], deleteRow: vi.fn() };
    expect(() => removeEntry(repo, 99)).toThrow("Entry 99 not found");
  });
});

/** In-memory fake repository — counts readRows() calls so tests can assert single-read behavior. */
class FakeIoRepository {
  readRowsCallCount = 0;
  insertRowBefore = vi.fn();
  writeEntryFields = vi.fn();
  deleteRow = vi.fn();
  resolveMainCategory = vi.fn().mockReturnValue("FOOD");

  constructor(private rows: unknown[][]) {}

  readRows() {
    this.readRowsCallCount++;
    return this.rows;
  }
}

describe("insertEntry", () => {
  it("computes the next Entry ID, inserts in date order, writes fields, and resolves mainCategory", () => {
    const repo = new FakeIoRepository([
      [new Date("2026-01-05"), "FOOD", "FOOD", "Rent", "O", 200, 1],
      [new Date("2026-01-10"), "FOOD", "FOOD", "Snacks", "O", 50, 2],
    ]);

    const entry = insertEntry(repo, {
      date: "2026-01-07",
      tag: "FOOD",
      description: "Groceries",
      direction: "O",
      amount: 100,
    });

    expect(repo.insertRowBefore).toHaveBeenCalledWith(3);
    expect(repo.writeEntryFields).toHaveBeenCalledWith(3, {
      date: "2026-01-07",
      tag: "FOOD",
      description: "Groceries",
      direction: "O",
      amount: 100,
      id: 3,
    });
    expect(repo.resolveMainCategory).toHaveBeenCalledWith(3);
    expect(entry).toEqual({
      id: 3,
      date: "2026-01-07",
      tag: "FOOD",
      mainCategory: "FOOD",
      description: "Groceries",
      direction: "O",
      amount: 100,
    });
  });

  it("reads the IO data rows exactly once per insert", () => {
    const repo = new FakeIoRepository([
      [new Date("2026-01-05"), "FOOD", "FOOD", "Rent", "O", 200, 1],
    ]);

    insertEntry(repo, {
      date: "2026-01-07",
      tag: "FOOD",
      description: "Groceries",
      direction: "O",
      amount: 100,
    });

    expect(repo.readRowsCallCount).toBe(1);
  });

  it("appends to an empty sheet without inserting a row", () => {
    const repo = new FakeIoRepository([]);

    const entry = insertEntry(repo, {
      date: "2026-01-07",
      tag: "FOOD",
      description: "Groceries",
      direction: "O",
      amount: 100,
    });

    expect(repo.insertRowBefore).not.toHaveBeenCalled();
    expect(repo.writeEntryFields).toHaveBeenCalledWith(2, expect.objectContaining({ id: 1 }));
    expect(entry.id).toBe(1);
  });

  it("appends after the last row without inserting when the new date is latest", () => {
    const repo = new FakeIoRepository([
      [new Date("2026-01-05"), "FOOD", "FOOD", "Rent", "O", 200, 1],
    ]);

    insertEntry(repo, {
      date: "2026-01-10",
      tag: "FOOD",
      description: "Snacks",
      direction: "O",
      amount: 50,
    });

    expect(repo.insertRowBefore).not.toHaveBeenCalled();
    expect(repo.writeEntryFields).toHaveBeenCalledWith(3, expect.objectContaining({ id: 2 }));
  });
});
