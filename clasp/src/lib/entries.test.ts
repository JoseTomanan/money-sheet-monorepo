import { describe, it, expect } from "vitest";
import { findRowByEntryId } from "./entries";

/**
 * findRowByEntryId(idColumnValues, targetId)
 *
 * Pure helper: scans the raw values from the Entry-ID column (col H, row 2
 * onward) and returns the 1-based sheet row index where the Entry lives, or
 * null if not found.
 *
 * Row mapping: idColumnValues[i] corresponds to sheet row (i + 2).
 * e.g. idColumnValues[0] → sheet row 2, idColumnValues[1] → sheet row 3, …
 */

describe("findRowByEntryId", () => {
  // ── Cycle 1 — returns null for empty sheet ───────────────────────────
  it("returns null when the ID column is empty", () => {
    expect(findRowByEntryId([], 1)).toBeNull();
  });

  // ── Cycle 2 — finds the correct 1-based sheet row ───────────────────
  it("returns sheet row 2 when the entry is the first row", () => {
    // idColumnValues[0] → sheet row 2
    expect(findRowByEntryId([1], 1)).toBe(2);
  });

  it("returns the correct sheet row for an entry further down", () => {
    // idColumnValues[0]=10 → row 2, idColumnValues[1]=20 → row 3, idColumnValues[2]=30 → row 4
    expect(findRowByEntryId([10, 20, 30], 20)).toBe(3);
    expect(findRowByEntryId([10, 20, 30], 30)).toBe(4);
  });

  // ── Cycle 3 — not-found ──────────────────────────────────────────────
  it("returns null when the target ID is not present", () => {
    expect(findRowByEntryId([1, 2, 3], 999)).toBeNull();
  });

  // ── Cycle 4 — coerces non-numeric values to numbers for comparison ───
  it("treats string IDs as equal to numeric target (GAS may return strings)", () => {
    // GAS getValues() can return strings for number cells depending on format
    expect(findRowByEntryId(["1", "2", "3"], 2)).toBe(3);
  });

  // ── Cycle 5 — skips blank/separator rows (blank col H) ───────────────
  it("skips blank cells (separator rows have no ID)", () => {
    // Separator rows have empty string in col H
    expect(findRowByEntryId([1, "", 3], 3)).toBe(4);
    expect(findRowByEntryId(["", 5], 5)).toBe(3);
  });

  // ── Cycle 6 — duplicate ID edge case: returns the FIRST match ────────
  it("returns the first matching row when duplicate IDs exist (data corruption guard)", () => {
    expect(findRowByEntryId([7, 7, 8], 7)).toBe(2);
  });

  // ── Cycle 7 — handles mixed blank + valid IDs ────────────────────────
  it("finds ID correctly when there are blanks before and after", () => {
    // row 2=blank, row 3=blank, row 4=42, row 5=blank
    expect(findRowByEntryId(["", "", 42, ""], 42)).toBe(4);
  });

  // ── Cycle 8 — zero / falsy ID values are not confused with blank ──────
  it("does not match a blank cell when searching for 0", () => {
    // 0 is a technically-invalid Entry ID (IDs start at 1) but must not
    // accidentally match a separator row's blank cell
    expect(findRowByEntryId(["", 1, 2], 0)).toBeNull();
  });
});
