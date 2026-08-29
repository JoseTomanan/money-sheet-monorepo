import { describe, it, expect, vi } from "vitest";
import {
  isSeparatorRow,
  listEntries,
  patchEntry,
  removeEntry,
  insertEntry,
  insertEntries,
  planFieldWrites,
  findEntriesByMutationId,
  payloadsMatch,
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

describe("mutation ID lookup", () => {
  const payloads = [
    { date: "2026-01-10", tag: "Dining", description: "first", direction: "O" as const, amount: 40 },
    { date: "2026-01-05", tag: "Rent", description: "^^", direction: "O" as const, amount: 60 },
  ];

  it("returns a batch in original request order (Entry ID order), not sheet date order", () => {
    const rows = [
      [new Date("2026-01-05"), "Rent", "HOUSING", "^^", "O", 60, 12, "mutation-1"],
      [new Date("2026-01-10"), "Dining", "FOOD", "first", "O", 40, 11, "mutation-1"],
      [new Date("2026-01-12"), "Dining", "FOOD", "other", "O", 20, 13, "mutation-2"],
      [new Date("2026-01-19"), "", "", "Week", "", "", "", ""],
    ];

    const entries = findEntriesByMutationId(rows, "mutation-1", (date) =>
      (date as Date).toISOString().slice(0, 10),
    );

    expect(entries.map((entry) => entry.id)).toEqual([11, 12]);
    expect(entries.map((entry) => entry.row)).toEqual([3, 2]);
    expect(payloadsMatch(entries, payloads)).toBe(true);
  });

  it("rejects a reused key whose payload content differs", () => {
    const rows = [[new Date("2026-01-10"), "Dining", "FOOD", "first", "O", 40, 11, "mutation-1"]];
    const entries = findEntriesByMutationId(rows, "mutation-1", (date) =>
      (date as Date).toISOString().slice(0, 10),
    );

    expect(payloadsMatch(entries, [{ ...payloads[0], amount: 41 }])).toBe(false);
  });

  it("ignores historical and separator rows with blank mutation IDs", () => {
    const rows = [
      [new Date("2026-01-10"), "Dining", "FOOD", "historical", "O", 40, 11, ""],
      [new Date("2026-01-12"), "", "", "Week", "", "", "", ""],
    ];
    expect(findEntriesByMutationId(rows, "mutation-1", String)).toEqual([]);
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
        row: 3, // sheet row 2 is the separator; this entry sits at row 3
      },
    ]);
  });

  it("stamps each entry with its true 1-based sheet row, unaffected by a separator in the middle", () => {
    const rows = [
      [new Date("2026-01-06"), "FOOD", "FOOD", "Groceries", "O", 100, 1], // row 2
      [new Date("2026-01-08"), "", "", "Week of Jan 8", "", "", ""], // row 3, separator
      [new Date("2026-01-09"), "FOOD", "FOOD", "Snacks", "O", 50, 2], // row 4
    ];
    const repo = { readRows: () => rows };
    const entries = listEntries(repo, (d) => (d as Date).toISOString().slice(0, 10));

    expect(entries.map((e) => e.row)).toEqual([2, 4]);
  });
});

describe("patchEntry", () => {
  it("writes only the provided fields to the row matching the Entry ID", () => {
    const rows = [
      ["", "", "", "sep", "", "", ""],
      [new Date("2026-01-06"), "FOOD", "FOOD", "Groceries", "O", 100, 1],
    ];
    const writeEntryFields = vi.fn();
    const repo = { readRows: () => rows, writeEntryFields, deleteRow: vi.fn(), insertRowBefore: vi.fn() };

    patchEntry(repo, 1, { amount: 150, description: "Groceries (updated)" }, String);

    expect(writeEntryFields).toHaveBeenCalledWith(3, {
      amount: 150,
      description: "Groceries (updated)",
    });
  });

  it("throws when the Entry ID does not exist", () => {
    const repo = { readRows: () => [], writeEntryFields: vi.fn(), deleteRow: vi.fn(), insertRowBefore: vi.fn() };
    expect(() => patchEntry(repo, 99, { amount: 1 }, String)).toThrow("Entry 99 not found");
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

/** Mutable sheet stand-in for asserting row order after a reposition. */
class MutableIoRepository {
  constructor(readonly rows: unknown[][]) {}

  readRows() {
    return this.rows;
  }

  insertRowBefore(sheetRow: number) {
    this.rows.splice(sheetRow - 2, 0, Array(8).fill(""));
  }

  deleteRow(sheetRow: number) {
    this.rows.splice(sheetRow - 2, 1);
  }

  writeEntryFields(sheetRow: number, fields: Record<string, unknown>) {
    const row = this.rows[sheetRow - 2];
    if (fields.date !== undefined) row[0] = fields.date;
    if (fields.tag !== undefined) row[1] = fields.tag;
    if (fields.description !== undefined) row[3] = fields.description;
    if (fields.direction !== undefined) row[4] = fields.direction;
    if (fields.amount !== undefined) row[5] = fields.amount;
    if (fields.id !== undefined) row[6] = fields.id;
    if (fields.mutationId !== undefined) row[7] = fields.mutationId;
  }

  resolveMainCategory() {
    return "FOOD";
  }
}

describe("patchEntry date repositioning", () => {
  const entry = (date: string, id: number, description = `entry-${id}`) =>
    [date, "Dining", "FOOD", description, "O", id * 10, id, `mutation-${id}`];
  const ids = (repo: MutableIoRepository) => repo.rows
    .filter((row) => row[6] !== "")
    .map((row) => row[6]);

  it("moves an Entry earlier after existing Entries on the destination date", () => {
    const repo = new MutableIoRepository([
      entry("2026-01-10", 1),
      entry("2026-01-15", 2),
      entry("2026-01-20", 3, "moved"),
    ]);

    patchEntry(repo, 3, { date: "2026-01-10", amount: 99 }, String);

    expect(ids(repo)).toEqual([1, 3, 2]);
    expect(repo.rows[1]).toEqual(["2026-01-10", "Dining", "FOOD", "moved", "O", 99, 3, "mutation-3"]);
  });

  it("moves an Entry later after existing Entries on the destination date", () => {
    const repo = new MutableIoRepository([
      entry("2026-01-10", 1),
      entry("2026-01-15", 2),
      entry("2026-01-20", 3),
    ]);

    patchEntry(repo, 1, { date: "2026-01-20" }, String);

    expect(ids(repo)).toEqual([2, 3, 1]);
  });

  it("keeps non-date and unchanged-date patches in place", () => {
    const repo = new MutableIoRepository([entry("2026-01-10", 1), entry("2026-01-15", 2)]);
    const deleteRow = vi.spyOn(repo, "deleteRow");
    const insertRowBefore = vi.spyOn(repo, "insertRowBefore");

    patchEntry(repo, 1, { description: "renamed" }, String);
    patchEntry(repo, 2, { date: "2026-01-15", amount: 42 }, String);

    expect(ids(repo)).toEqual([1, 2]);
    expect(repo.rows[0][3]).toBe("renamed");
    expect(repo.rows[1][5]).toBe(42);
    expect(deleteRow).not.toHaveBeenCalled();
    expect(insertRowBefore).not.toHaveBeenCalled();
  });

  it("keeps Week Separator rows intact while moving an Entry", () => {
    const separator = ["2026-01-11", "", "", "WEEK OF JAN 11", "", "", "", ""];
    const repo = new MutableIoRepository([
      entry("2026-01-10", 1),
      separator,
      entry("2026-01-12", 2),
      entry("2026-01-20", 3),
    ]);

    patchEntry(repo, 3, { date: "2026-01-12" }, String);

    expect(repo.rows[1]).toBe(separator);
    expect(repo.rows[1]).toEqual(["2026-01-11", "", "", "WEEK OF JAN 11", "", "", "", ""]);
    expect(ids(repo)).toEqual([1, 2, 3]);
  });

  it("leaves a subsequent insert correctly date ordered after a move", () => {
    const repo = new MutableIoRepository([entry("2026-01-10", 1), entry("2026-01-20", 2)]);

    patchEntry(repo, 1, { date: "2026-01-15" }, String);
    insertEntry(repo, {
      date: "2026-01-15",
      tag: "Dining",
      description: "new same-date entry",
      direction: "O",
      amount: 30,
    });

    expect(ids(repo)).toEqual([1, 3, 2]);
  });
});

describe("insertEntry", () => {
  it("writes a mutation ID beside a newly-created Entry", () => {
    const repo = new FakeIoRepository([]);
    insertEntry(repo, { date: "2026-01-07", tag: "FOOD", description: "Groceries", direction: "O", amount: 100 }, "mutation-1");
    expect(repo.writeEntryFields).toHaveBeenCalledWith(2, expect.objectContaining({ id: 1, mutationId: "mutation-1" }));
  });
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
      row: 3,
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
    expect(entry.row).toBe(2);
  });

  it("appends after the last row without inserting when the new date is latest", () => {
    const repo = new FakeIoRepository([
      [new Date("2026-01-05"), "FOOD", "FOOD", "Rent", "O", 200, 1],
    ]);

    const entry = insertEntry(repo, {
      date: "2026-01-10",
      tag: "FOOD",
      description: "Snacks",
      direction: "O",
      amount: 50,
    });

    expect(repo.insertRowBefore).not.toHaveBeenCalled();
    expect(repo.writeEntryFields).toHaveBeenCalledWith(3, expect.objectContaining({ id: 2 }));
    expect(entry.row).toBe(3);
  });
});

describe("insertEntries", () => {
  it("writes one shared mutation ID for every batch leg", () => {
    const repo = new FakeIoRepository([]);
    insertEntries(repo, [
      { date: "2026-01-07", tag: "FOOD", description: "first", direction: "O", amount: 40 },
      { date: "2026-01-07", tag: "FOOD", description: "^^", direction: "O", amount: 60 },
    ], "mutation-1");
    expect(repo.writeEntryFields).toHaveBeenNthCalledWith(1, 2, expect.objectContaining({ mutationId: "mutation-1" }));
    expect(repo.writeEntryFields).toHaveBeenNthCalledWith(2, 3, expect.objectContaining({ mutationId: "mutation-1" }));
  });
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
      { id: 2, date: "2026-01-10", tag: "FOOD", mainCategory: "FOOD", description: "Split A", direction: "O", amount: 40, row: 3 },
      { id: 3, date: "2026-01-10", tag: "FOOD", mainCategory: "FOOD", description: "^^", direction: "O", amount: 60, row: 4 },
    ]);
  });

  it("stays correct under date-ordered insertion when legs interleave with existing dated rows", () => {
    const repo = new FakeIoRepository([
      [new Date("2026-01-05"), "FOOD", "FOOD", "Rent", "O", 200, 1],
      [new Date("2026-01-20"), "FOOD", "FOOD", "Late bill", "O", 30, 2],
    ]);

    // Both new legs date 2026-01-10 — must land between the existing rows
    // (row 3), shifting the existing 2026-01-20 row down each time.
    const entries = insertEntries(repo, [
      { date: "2026-01-10", tag: "FOOD", description: "Split A", direction: "O", amount: 40 },
      { date: "2026-01-10", tag: "FOOD", description: "^^", direction: "O", amount: 60 },
    ]);

    expect(repo.insertRowBefore).toHaveBeenNthCalledWith(1, 3);
    expect(repo.insertRowBefore).toHaveBeenNthCalledWith(2, 4);
    expect(repo.writeEntryFields).toHaveBeenNthCalledWith(1, 3, expect.objectContaining({ id: 3 }));
    expect(repo.writeEntryFields).toHaveBeenNthCalledWith(2, 4, expect.objectContaining({ id: 4 }));
    expect(entries.map((e) => e.row)).toEqual([3, 4]);
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
    expect(entries.map((e) => e.row)).toEqual([2, 3]);
  });
});
