import { describe, it, expect, beforeEach, vi } from "vitest";
import { readCache, writeCache } from "./cache";
import type { CachePayload } from "./cache";

const payload: CachePayload = {
  entries: [
    {
      id: 1,
      date: "2026-01-15",
      tag: "Groceries",
      mainCategory: "Food",
      description: "test entry",
      direction: "O",
      amount: 100,
    },
  ],
  master: { onHand: 5000, budgets: { Food: 300 } },
  categories: { Food: ["Groceries", "Dining"] },
  breakdown: { Groceries: 100 },
};

describe("cache", () => {
  beforeEach(() => localStorage.clear());

  it("readCache returns null when localStorage is empty", () => {
    expect(readCache()).toBeNull();
  });

  it("readCache returns null when stored value is invalid JSON", () => {
    localStorage.setItem("ms_cache", "not-json");
    expect(readCache()).toBeNull();
  });

  it("writeCache + readCache round-trips the full payload", () => {
    writeCache(payload);
    expect(readCache()).toEqual(payload);
  });

  it("writeCache stores under the ms_cache key", () => {
    writeCache(payload);
    expect(localStorage.getItem("ms_cache")).toBe(JSON.stringify(payload));
  });

  it("writeCache overwrites previously cached data", () => {
    writeCache(payload);
    const updated: CachePayload = { ...payload, master: { onHand: 9999, budgets: {} } };
    writeCache(updated);
    expect(readCache()?.master.onHand).toBe(9999);
  });

  it("writeCache does not throw when localStorage.setItem throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => {
      throw new Error("QuotaExceededError");
    });
    expect(() => writeCache(payload)).not.toThrow();
  });
});
