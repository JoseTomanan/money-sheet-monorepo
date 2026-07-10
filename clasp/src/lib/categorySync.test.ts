import { describe, it, expect, vi } from "vitest";
import {
  classifyCategoryEdit,
  parentCategoryForRow,
  countMatchingOutgoingTags,
  retagOutgoingRows,
  findNameCollision,
  encodePendingSync,
  decodePendingSync,
  runCategorySync,
  retryCategorySync,
} from "./categorySync";

/**
 * classifyCategoryEdit(input)
 *
 * Pure classifier for a Categories-sheet onEdit event. Only a single-cell
 * edit to col B (Subcategory), at or below row 2, is ever a rename or
 * delete — everything else (wrong column, header row, multi-cell edits) is
 * "ignore".
 */

describe("classifyCategoryEdit", () => {
  // ── Cycle 1 — rename shape ────────────────────────────────────────────
  it("classifies a non-empty -> different non-empty col B edit as a rename", () => {
    const result = classifyCategoryEdit({
      isCategoriesSheet: true,
      column: 2,
      row: 5,
      numRows: 1,
      numCols: 1,
      oldValue: "Dining",
      value: "Dining Out",
    });

    expect(result).toEqual({ kind: "rename", oldValue: "Dining", newValue: "Dining Out" });
  });

  // ── Cycle 2 — delete shape ────────────────────────────────────────────
  it("classifies a non-empty -> empty col B edit as a delete", () => {
    const result = classifyCategoryEdit({
      isCategoriesSheet: true,
      column: 2,
      row: 5,
      numRows: 1,
      numCols: 1,
      oldValue: "Dining",
      value: "",
    });

    expect(result).toEqual({ kind: "delete", oldValue: "Dining" });
  });

  // ── Cycle 3 — ignore shapes ───────────────────────────────────────────
  it("ignores an edit outside the Categories sheet", () => {
    const result = classifyCategoryEdit({
      isCategoriesSheet: false,
      column: 2,
      row: 5,
      numRows: 1,
      numCols: 1,
      oldValue: "Dining",
      value: "Dining Out",
    });

    expect(result).toEqual({ kind: "ignore" });
  });

  it("ignores an edit outside col B (Subcategory)", () => {
    const result = classifyCategoryEdit({
      isCategoriesSheet: true,
      column: 3,
      row: 5,
      numRows: 1,
      numCols: 1,
      oldValue: "FOOD",
      value: "FOOD 2",
    });

    expect(result).toEqual({ kind: "ignore" });
  });

  it("ignores an edit to the header row (row 1)", () => {
    const result = classifyCategoryEdit({
      isCategoriesSheet: true,
      column: 2,
      row: 1,
      numRows: 1,
      numCols: 1,
      oldValue: "Subcategory",
      value: "Subcat",
    });

    expect(result).toEqual({ kind: "ignore" });
  });

  it("ignores a multi-cell edit (paste across rows or columns)", () => {
    const multiRow = classifyCategoryEdit({
      isCategoriesSheet: true,
      column: 2,
      row: 5,
      numRows: 2,
      numCols: 1,
      oldValue: undefined,
      value: undefined,
    });
    const multiCol = classifyCategoryEdit({
      isCategoriesSheet: true,
      column: 2,
      row: 5,
      numRows: 1,
      numCols: 2,
      oldValue: undefined,
      value: undefined,
    });

    expect(multiRow).toEqual({ kind: "ignore" });
    expect(multiCol).toEqual({ kind: "ignore" });
  });

  it("ignores a fresh fill-in (empty -> non-empty) and a no-op retype (same value)", () => {
    const freshFill = classifyCategoryEdit({
      isCategoriesSheet: true,
      column: 2,
      row: 5,
      numRows: 1,
      numCols: 1,
      oldValue: "",
      value: "Dining",
    });
    const noOp = classifyCategoryEdit({
      isCategoriesSheet: true,
      column: 2,
      row: 5,
      numRows: 1,
      numCols: 1,
      oldValue: "Dining",
      value: "Dining",
    });

    expect(freshFill).toEqual({ kind: "ignore" });
    expect(noOp).toEqual({ kind: "ignore" });
  });
});

/**
 * parentCategoryForRow(catData, row)
 *
 * catData is the [Subcategory, Category] rows read from the Categories sheet
 * starting at row 2 (catData[0] -> sheet row 2, etc). Column C (Category) is
 * a merged cell spanning all subcategories of that Category, so getValues()
 * only returns a value in the first row of each merge block — this walks
 * catData tracking the last-seen non-blank Category to resolve the parent
 * for any row in the block.
 */
describe("parentCategoryForRow", () => {
  it("resolves the merged parent Category for a row mid-block (blank col C)", () => {
    const catData = [
      ["Dining", "FOOD"],
      ["Groceries", ""],
      ["Snacks", ""],
    ];

    // catData[1] -> sheet row 3 ("Groceries", blank col C)
    expect(parentCategoryForRow(catData, 3)).toBe("FOOD");
    // catData[2] -> sheet row 4 ("Snacks", blank col C)
    expect(parentCategoryForRow(catData, 4)).toBe("FOOD");
  });
});

/**
 * countMatchingOutgoingTags(rows, oldTag)
 *
 * rows are IoRow[] from IoRepository.readRows() — cols B-H as
 * [date, tag, mainCategory, description, direction, amount, id]. Counts only
 * Outgoing rows whose Tag exactly equals oldTag; Incoming rows, non-matching
 * tags, and separator rows (blank id) don't count.
 */
describe("countMatchingOutgoingTags", () => {
  it("counts only Outgoing rows with an exact Tag match, skipping Incoming and separators", () => {
    const rows = [
      [new Date("2026-01-05"), "", "", "Week of Jan 5", "", "", ""], // separator
      [new Date("2026-01-06"), "Dining", "FOOD", "Lunch", "O", 100, 1], // match
      [new Date("2026-01-07"), "Dining", "FOOD", "Salary", "I", 500, 2], // Incoming, same tag — not counted
      [new Date("2026-01-08"), "Groceries", "FOOD", "Snacks", "O", 50, 3], // different tag
      [new Date("2026-01-09"), "Dining", "FOOD", "Dinner", "O", 80, 4], // match
    ];

    expect(countMatchingOutgoingTags(rows, "Dining")).toBe(2);
  });
});

/**
 * retagOutgoingRows(repo, oldTag, newTag)
 *
 * Rewrites Tag (col C, via writeEntryFields({ tag: newTag })) on every
 * Outgoing row whose Tag exactly equals oldTag. Returns the number of rows
 * rewritten. Incoming rows and non-matching Outgoing rows are untouched —
 * same matching rule as countMatchingOutgoingTags, reused here so the
 * pre-lock count and the actual write never disagree.
 */
describe("retagOutgoingRows", () => {
  it("rewrites Tag on every matching Outgoing row and returns the count", () => {
    const rows = [
      [new Date("2026-01-06"), "Dining", "FOOD", "Lunch", "O", 100, 1], // match, sheet row 2
      [new Date("2026-01-07"), "Dining", "FOOD", "Salary", "I", 500, 2], // Incoming — untouched, sheet row 3
      [new Date("2026-01-08"), "Groceries", "FOOD", "Snacks", "O", 50, 3], // different tag — untouched, sheet row 4
      [new Date("2026-01-09"), "Dining", "FOOD", "Dinner", "O", 80, 4], // match, sheet row 5
    ];
    const writeEntryFields = vi.fn();
    const repo = { readRows: () => rows, writeEntryFields };

    const count = retagOutgoingRows(repo, "Dining", "Dining Out");

    expect(count).toBe(2);
    expect(writeEntryFields).toHaveBeenCalledTimes(2);
    expect(writeEntryFields).toHaveBeenCalledWith(2, { tag: "Dining Out" });
    expect(writeEntryFields).toHaveBeenCalledWith(5, { tag: "Dining Out" });
  });
});

/**
 * findNameCollision(newName, catData, row)
 *
 * catData already reflects the post-edit sheet (GAS applies the cell edit
 * before onEdit fires), so `row`'s own entry already reads as newName and
 * must be excluded from the "other Subcategory" set or every rename would
 * collide with itself. Checked against both Subcategory names (any Category)
 * and the 7 top-level Category names.
 */
describe("findNameCollision", () => {
  const catData: [string, string][] = [
    ["Dining", "FOOD"],
    ["Groceries", ""],
    ["Rent", "HOUSING"],
  ];

  it("blocks a rename that collides with an existing Subcategory under another Category", () => {
    // row 4 ("Rent") renamed to "Dining" -> catData[2] now reads "Dining"
    const collidingCatData: [string, string][] = [
      ["Dining", "FOOD"],
      ["Groceries", ""],
      ["Dining", "HOUSING"],
    ];

    const result = findNameCollision("Dining", collidingCatData, 4);

    expect(result).toEqual({ message: "'Dining' already exists under FOOD — rename aborted" });
  });

  it("blocks a rename that collides with a top-level Category name", () => {
    const collidingCatData: [string, string][] = [
      ["FOOD", "FOOD"],
      ["Groceries", ""],
      ["Rent", "HOUSING"],
    ];

    const result = findNameCollision("FOOD", collidingCatData, 2);

    expect(result).toEqual({ message: "'FOOD' already exists as a top-level Category — rename aborted" });
  });

  it("excludes the edited row itself and returns null when the new name is unique", () => {
    // row 3 ("Groceries") renamed to "Snacks" -> catData[1] now reads "Snacks"
    const renamedCatData: [string, string][] = [
      ["Dining", "FOOD"],
      ["Snacks", ""],
      ["Rent", "HOUSING"],
    ];

    expect(findNameCollision("Snacks", renamedCatData, 3)).toBeNull();
  });
});

/**
 * encodePendingSync / decodePendingSync
 *
 * Round-trips the one stashed pending propagation (rename or delete,
 * collapsed to "retag oldValue -> newTag") through Script Properties, which
 * only stores strings.
 */
describe("encodePendingSync / decodePendingSync", () => {
  it("round-trips a pending rename", () => {
    const pending = { kind: "rename" as const, oldValue: "Dining", newTag: "Dining Out" };
    expect(decodePendingSync(encodePendingSync(pending))).toEqual(pending);
  });

  it("round-trips a pending delete", () => {
    const pending = { kind: "delete" as const, oldValue: "Dining", newTag: "FOOD" };
    expect(decodePendingSync(encodePendingSync(pending))).toEqual(pending);
  });

  it("decodes null (no stashed property) as null", () => {
    expect(decodePendingSync(null)).toBeNull();
  });
});

/**
 * runCategorySync(deps)
 *
 * The full onEdit-fired flow: classify -> (rename) collision guard -> count
 * matching Outgoing rows -> confirm -> on YES, retag under the document
 * lock. Ignored edit shapes and a declined confirmation leave
 * INCOMING/OUTGOING untouched.
 */
describe("runCategorySync", () => {
  const Button = { YES: "YES", NO: "NO" } as const;
  const ButtonSet = { YES_NO: "YES_NO" } as const;

  const renameEdit = {
    isCategoriesSheet: true,
    column: 2,
    row: 3,
    numRows: 1,
    numCols: 1,
    oldValue: "Dining",
    value: "Dining Out",
  };

  function makeRows() {
    return [
      [new Date("2026-01-06"), "Dining", "FOOD", "Lunch", "O", 100, 1],
      [new Date("2026-01-07"), "Groceries", "FOOD", "Snacks", "O", 50, 2],
    ];
  }

  it("on a rename, confirms naming the affected count and old/new names, then retags under the lock on YES", () => {
    const writeEntryFields = vi.fn();
    const repo = { readRows: () => makeRows(), writeEntryFields };
    const alert = vi.fn().mockReturnValue(Button.YES);
    const ui = { alert, Button, ButtonSet };
    const withLock = vi.fn((fn: () => unknown) => fn());
    const stash = vi.fn();

    runCategorySync({
      edit: renameEdit,
      getCatData: () => [["Dining", "FOOD"]],
      repo,
      ui,
      withLock,
      stash,
    });

    expect(alert).toHaveBeenCalledWith(
      expect.stringContaining("1"),
      ButtonSet.YES_NO
    );
    expect(alert.mock.calls[0][0]).toContain("Dining");
    expect(alert.mock.calls[0][0]).toContain("Dining Out");
    expect(withLock).toHaveBeenCalledOnce();
    expect(writeEntryFields).toHaveBeenCalledWith(2, { tag: "Dining Out" });
    expect(stash).not.toHaveBeenCalled();
  });

  it("ignores an edit shape that classifies as ignore — no alert, no write", () => {
    const writeEntryFields = vi.fn();
    const repo = { readRows: () => makeRows(), writeEntryFields };
    const alert = vi.fn();
    const ui = { alert, Button, ButtonSet };
    const withLock = vi.fn((fn: () => unknown) => fn());
    const stash = vi.fn();
    const getCatData = vi.fn(() => [["Dining", "FOOD"]] as [string, string][]);

    runCategorySync({
      edit: { ...renameEdit, column: 3 }, // col C, not col B — ignore
      getCatData,
      repo,
      ui,
      withLock,
      stash,
    });

    expect(alert).not.toHaveBeenCalled();
    expect(writeEntryFields).not.toHaveBeenCalled();
    expect(getCatData).not.toHaveBeenCalled();
  });

  it("on decline (NO), leaves INCOMING/OUTGOING untouched", () => {
    const writeEntryFields = vi.fn();
    const repo = { readRows: () => makeRows(), writeEntryFields };
    const alert = vi.fn().mockReturnValue(Button.NO);
    const ui = { alert, Button, ButtonSet };
    const withLock = vi.fn((fn: () => unknown) => fn());
    const stash = vi.fn();

    runCategorySync({
      edit: renameEdit,
      getCatData: () => [["Dining", "FOOD"]],
      repo,
      ui,
      withLock,
      stash,
    });

    expect(writeEntryFields).not.toHaveBeenCalled();
    expect(withLock).not.toHaveBeenCalled();
  });

  it("on a delete, confirms naming the parent Category, then retags to it under the lock on YES", () => {
    const deleteEdit = { ...renameEdit, oldValue: "Dining", value: "" };
    const writeEntryFields = vi.fn();
    const repo = { readRows: () => makeRows(), writeEntryFields };
    const alert = vi.fn().mockReturnValue(Button.YES);
    const ui = { alert, Button, ButtonSet };
    const withLock = vi.fn((fn: () => unknown) => fn());
    const stash = vi.fn();

    runCategorySync({
      edit: deleteEdit,
      getCatData: () => [["Dining", "FOOD"]],
      repo,
      ui,
      withLock,
      stash,
    });

    expect(alert.mock.calls[0][0]).toContain("FOOD");
    expect(writeEntryFields).toHaveBeenCalledWith(2, { tag: "FOOD" });
    expect(stash).not.toHaveBeenCalled();
  });

  it("blocks a colliding rename with an error alert before any confirmation dialog — no write", () => {
    const writeEntryFields = vi.fn();
    const repo = { readRows: () => makeRows(), writeEntryFields };
    const alert = vi.fn();
    const ui = { alert, Button, ButtonSet };
    const withLock = vi.fn((fn: () => unknown) => fn());
    const stash = vi.fn();

    runCategorySync({
      edit: renameEdit, // renaming "Dining" -> "Dining Out"
      getCatData: () => [["Dining Out", "FOOD"], ["Groceries", ""]], // "Dining Out" already exists
      repo,
      ui,
      withLock,
      stash,
    });

    expect(alert).toHaveBeenCalledOnce();
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("already exists"));
    expect(writeEntryFields).not.toHaveBeenCalled();
    expect(withLock).not.toHaveBeenCalled();
  });

  it("on a lock-acquisition failure, stashes the pending propagation and alerts instead of partially applying it", () => {
    const writeEntryFields = vi.fn();
    const repo = { readRows: () => makeRows(), writeEntryFields };
    const alert = vi.fn().mockReturnValue(Button.YES);
    const ui = { alert, Button, ButtonSet };
    const withLock = vi.fn(() => {
      throw new Error("Lock timeout");
    });
    const stash = vi.fn();

    runCategorySync({
      edit: renameEdit,
      getCatData: () => [["Dining", "FOOD"]],
      repo,
      ui,
      withLock,
      stash,
    });

    expect(writeEntryFields).not.toHaveBeenCalled();
    expect(stash).toHaveBeenCalledWith({ kind: "rename", oldValue: "Dining", newTag: "Dining Out" });
    expect(alert).toHaveBeenCalledTimes(2); // confirmation, then lock-failure notice
  });
});

/**
 * retryCategorySync(deps)
 *
 * Re-attempts exactly the one stashed pending propagation (not a general
 * re-diff of the Categories sheet) — same confirm -> lock -> bulk-write
 * flow as runCategorySync, keyed off the already-resolved oldValue/newTag
 * pair instead of re-classifying an edit event.
 */
describe("retryCategorySync", () => {
  const Button = { YES: "YES", NO: "NO" } as const;
  const ButtonSet = { YES_NO: "YES_NO" } as const;

  function makeRows() {
    return [[new Date("2026-01-06"), "Dining", "FOOD", "Lunch", "O", 100, 1]];
  }

  it("alerts when there is no pending sync to retry", () => {
    const alert = vi.fn();
    const ui = { alert, Button, ButtonSet };
    const repo = { readRows: () => makeRows(), writeEntryFields: vi.fn() };
    const withLock = vi.fn((fn: () => unknown) => fn());

    retryCategorySync({
      pending: null,
      repo,
      ui,
      withLock,
      clearStash: vi.fn(),
      restash: vi.fn(),
    });

    expect(alert).toHaveBeenCalledOnce();
    expect(withLock).not.toHaveBeenCalled();
  });

  it("on YES, retags the stashed pending propagation and clears the stash", () => {
    const writeEntryFields = vi.fn();
    const repo = { readRows: () => makeRows(), writeEntryFields };
    const alert = vi.fn().mockReturnValue(Button.YES);
    const ui = { alert, Button, ButtonSet };
    const withLock = vi.fn((fn: () => unknown) => fn());
    const clearStash = vi.fn();

    retryCategorySync({
      pending: { kind: "rename", oldValue: "Dining", newTag: "Dining Out" },
      repo,
      ui,
      withLock,
      clearStash,
      restash: vi.fn(),
    });

    expect(writeEntryFields).toHaveBeenCalledWith(2, { tag: "Dining Out" });
    expect(clearStash).toHaveBeenCalledOnce();
  });

  it("on a repeated lock-acquisition failure, restashes the pending propagation and alerts", () => {
    const writeEntryFields = vi.fn();
    const repo = { readRows: () => makeRows(), writeEntryFields };
    const alert = vi.fn().mockReturnValue(Button.YES);
    const ui = { alert, Button, ButtonSet };
    const withLock = vi.fn(() => {
      throw new Error("Lock timeout");
    });
    const restash = vi.fn();
    const clearStash = vi.fn();
    const pending = { kind: "rename" as const, oldValue: "Dining", newTag: "Dining Out" };

    retryCategorySync({ pending, repo, ui, withLock, clearStash, restash });

    expect(writeEntryFields).not.toHaveBeenCalled();
    expect(clearStash).not.toHaveBeenCalled();
    expect(restash).toHaveBeenCalledWith(pending);
    expect(alert).toHaveBeenCalledTimes(2); // confirmation, then lock-failure notice
  });
});
