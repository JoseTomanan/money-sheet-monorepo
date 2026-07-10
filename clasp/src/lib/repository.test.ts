import { describe, it, expect, vi } from "vitest";
import {
  isSeparatorRow,
  listEntries,
  patchEntry,
  removeEntry,
  insertEntry,
  insertEntries,
  planFieldWrites,
} from "./repository";

describe("planFieldWrites", () => {
  it("splits a full-field write into consecutive-column runs, skipping col D", () => {
    const runs = planFieldWrites({
      date: "2026-01-07",
      tag: "FOOD",
      description: "Groceries",
      direction: "O",
      amount: 100,
      id: 3,
    });

    expect(runs).toEqual([
      { startCol: 2, values: ["2026-01-07", "FOOD"] },
      { startCol: 5, values: ["Groceries", "O", 100, 3] },
    ]);
  });

  it("collapses a contiguous partial patch into a single run", () => {
    const runs = planFieldWrites({ description: "Groceries (updated)", direction: "O", amount: 150 });

    expect(runs).toEqual([{ startCol: 5, values: ["Groceries (updated)", "O", 150] }]);
  });

  it("splits a gapped partial patch (skipping direction) into two runs", () => {
    const runs = planFieldWrites({ description: "Groceries (updated)", amount: 150 });

    expect(runs).toEqual([
      { startCol: 5, values: ["Groceries (updated)"] },
      { startCol: 7, values: [150] },
    ]);
  });

  it("returns an empty array for an empty patch", () => {
    expect(planFieldWrites({})).toEqual([]);
  });
});

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

describe("insertEntries", () => {
  it("reads the IO data rows exactly once for the whole batch", () => {
    const repo = new FakeIoRepository([
      [new Date("2026-01-05"), "FOOD", "FOOD", "Rent", "O", 200, 1],
    ]);

    insertEntries(repo, [
      { date: "2026-01-10", tag: "FOOD", description: "Split A", direction: "O", amount: 40 },
      { date: "2026-01-10", tag: "FOOD", description: "^^", direction: "O", amount: 60 },
      { date: "2026-01-10", tag: "FOOD", description: "^^", direction: "O", amount: 80 },
    ]);

    expect(repo.readRowsCallCount).toBe(1);
  });

  it("assigns N distinct contiguous ids in array order (leg 0 lowest)", () => {
    const repo = new FakeIoRepository([
      [new Date("2026-01-05"), "FOOD", "FOOD", "Rent", "O", 200, 1],
      [new Date("2026-01-10"), "FOOD", "FOOD", "Snacks", "O", 50, 2],
    ]);

    const entries = insertEntries(repo, [
      { date: "2026-01-07", tag: "FOOD", description: "Split A", direction: "O", amount: 40 },
      { date: "2026-01-07", tag: "FOOD", description: "^^", direction: "O", amount: 60 },
    ]);

    expect(entries.map((e) => e.id)).toEqual([3, 4]);
  });

  it("writes each leg's fields and resolves mainCategory per row, in order", () => {
    const repo = new FakeIoRepository([
      [new Date("2026-01-05"), "FOOD", "FOOD", "Rent", "O", 200, 1],
    ]);

    const entries = insertEntries(repo, [
      { date: "2026-01-10", tag: "FOOD", description: "Split A", direction: "O", amount: 40 },
      { date: "2026-01-10", tag: "FOOD", description: "^^", direction: "O", amount: 60 },
    ]);

    // Both legs share a date later than the only existing row (row 2), and
    // insert adjacently in array order: leg 0 at row 3, leg 1 at row 4.
    expect(repo.insertRowBefore).not.toHaveBeenCalled();
    expect(repo.writeEntryFields).toHaveBeenNthCalledWith(1, 3, {
      date: "2026-01-10",
      tag: "FOOD",
      description: "Split A",
      direction: "O",
      amount: 40,
      id: 2,
    });
    expect(repo.writeEntryFields).toHaveBeenNthCalledWith(2, 4, {
      date: "2026-01-10",
      tag: "FOOD",
      description: "^^",
      direction: "O",
      amount: 60,
      id: 3,
    });
    expect(repo.resolveMainCategory).toHaveBeenNthCalledWith(1, 3);
    expect(repo.resolveMainCategory).toHaveBeenNthCalledWith(2, 4);
    expect(entries).toEqual([
      { id: 2, date: "2026-01-10", tag: "FOOD", mainCategory: "FOOD", description: "Split A", direction: "O", amount: 40 },
      { id: 3, date: "2026-01-10", tag: "FOOD", mainCategory: "FOOD", description: "^^", direction: "O", amount: 60 },
    ]);
  });

  it("stays correct under date-ordered insertion when legs interleave with existing dated rows", () => {
    const repo = new FakeIoRepository([
      [new Date("2026-01-05"), "FOOD", "FOOD", "Rent", "O", 200, 1],
      [new Date("2026-01-20"), "FOOD", "FOOD", "Late bill", "O", 30, 2],
    ]);

    // Both new legs date 2026-01-10 — must land between the existing rows
    // (row 3), shifting the existing 2026-01-20 row down each time.
    insertEntries(repo, [
      { date: "2026-01-10", tag: "FOOD", description: "Split A", direction: "O", amount: 40 },
      { date: "2026-01-10", tag: "FOOD", description: "^^", direction: "O", amount: 60 },
    ]);

    expect(repo.insertRowBefore).toHaveBeenNthCalledWith(1, 3);
    expect(repo.insertRowBefore).toHaveBeenNthCalledWith(2, 4);
    expect(repo.writeEntryFields).toHaveBeenNthCalledWith(1, 3, expect.objectContaining({ id: 3 }));
    expect(repo.writeEntryFields).toHaveBeenNthCalledWith(2, 4, expect.objectContaining({ id: 4 }));
  });

  it("appends to an empty sheet without inserting a row", () => {
    const repo = new FakeIoRepository([]);

    const entries = insertEntries(repo, [
      { date: "2026-01-07", tag: "FOOD", description: "Split A", direction: "O", amount: 40 },
      { date: "2026-01-07", tag: "FOOD", description: "^^", direction: "O", amount: 60 },
    ]);

    expect(repo.insertRowBefore).not.toHaveBeenCalled();
    expect(repo.writeEntryFields).toHaveBeenNthCalledWith(1, 2, expect.objectContaining({ id: 1 }));
    expect(repo.writeEntryFields).toHaveBeenNthCalledWith(2, 3, expect.objectContaining({ id: 2 }));
    expect(entries.map((e) => e.id)).toEqual([1, 2]);
  });
});
