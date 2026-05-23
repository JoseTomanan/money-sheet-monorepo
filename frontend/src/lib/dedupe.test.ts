import { describe, it, expect } from "vitest";
import { dedupeEntries } from "./dedupe";
import type { Entry } from "./types";

function makeEntry(id: number): Entry {
  return { id, date: "2026-01-01", tag: "Groceries", mainCategory: "Food", description: "test", direction: "O", amount: 100 };
}

describe("dedupeEntries", () => {
  it("returns empty array unchanged", () => {
    expect(dedupeEntries([])).toEqual([]);
  });

  it("returns unique entries unchanged", () => {
    const entries = [makeEntry(1), makeEntry(2), makeEntry(3)];
    expect(dedupeEntries(entries)).toEqual(entries);
  });

  it("keeps first occurrence and drops subsequent duplicates", () => {
    const first = makeEntry(30);
    const dupe = { ...makeEntry(30), description: "duplicate" };
    const result = dedupeEntries([first, dupe]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(first);
  });

  it("preserves order of first occurrences", () => {
    const a = makeEntry(1);
    const b = makeEntry(2);
    const dupeA = makeEntry(1);
    const c = makeEntry(3);
    const result = dedupeEntries([a, b, dupeA, c]);
    expect(result.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it("handles multiple distinct duplicates", () => {
    const entries = [makeEntry(1), makeEntry(2), makeEntry(1), makeEntry(2), makeEntry(3)];
    const result = dedupeEntries(entries);
    expect(result.map((e) => e.id)).toEqual([1, 2, 3]);
  });
});
