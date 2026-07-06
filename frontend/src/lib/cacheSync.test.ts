import { describe, it, expect, beforeEach } from "vitest";
import { loadSnapshot, saveSnapshot } from "./cacheSync";
import { readCache } from "./cache";
import type { Entry } from "./types";

const dupEntries: Entry[] = [
  { id: 30, date: "2026-01-10", tag: "Groceries", mainCategory: "Food", description: "first", direction: "O", amount: 50 },
  { id: 30, date: "2026-01-11", tag: "Groceries", mainCategory: "Food", description: "duplicate", direction: "O", amount: 75 },
];

describe("cacheSync.loadSnapshot", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when there is no cached snapshot", () => {
    expect(loadSnapshot()).toBeNull();
  });

  it("dedupes entries with duplicate IDs, keeping first occurrence", () => {
    saveSnapshot({ entries: dupEntries, master: { onHand: 0, budgets: {} }, categories: {} });
    const snapshot = loadSnapshot();
    expect(snapshot?.entries).toHaveLength(1);
    expect(snapshot?.entries[0].description).toBe("first");
  });
});

describe("cacheSync.saveSnapshot", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("writes the payload to the underlying cache", () => {
    const payload = { entries: [], master: { onHand: 100, budgets: {} }, categories: {} };
    saveSnapshot(payload);
    expect(readCache()).toEqual(payload);
  });
});
