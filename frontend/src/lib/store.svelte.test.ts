import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeCache } from "./cache";
import type { CachePayload } from "./cache";
import type { Entry } from "./types";

const freshEntries: Entry[] = [
  {
    id: 1,
    date: "2026-01-15",
    tag: "Groceries",
    mainCategory: "Food",
    description: "fresh",
    direction: "O",
    amount: 100,
  },
];

const freshMaster = { onHand: 2000, budgets: { Food: 400 } };
const freshCategories = { Food: ["Groceries", "Dining"] };
const freshBreakdown = { Groceries: 100 };

function makePayload(overrides: Partial<CachePayload> = {}): CachePayload {
  return {
    entries: [],
    master: { onHand: 1000, budgets: { Food: 200 } },
    categories: { Food: ["Groceries"] },
    breakdown: { Groceries: 50 },
    ...overrides,
  };
}

function makeFetchMock() {
  return vi.fn().mockImplementation((url: string) => {
    const qs = typeof url === "string" && url.includes("?") ? url.split("?")[1] : "";
    const action = new URLSearchParams(qs).get("action");

    let body: Record<string, unknown>;
    switch (action) {
      case "getEntries":
        body = { entries: freshEntries };
        break;
      case "getMaster":
        body = { master: freshMaster };
        break;
      case "getCategories":
        body = { categories: freshCategories };
        break;
      case "getSubcategoryBreakdown":
        body = { breakdown: freshBreakdown };
        break;
      default:
        body = { error: `unknown action: ${action}` };
    }

    return Promise.resolve({ text: () => Promise.resolve(JSON.stringify(body)) });
  });
}

describe("store", () => {
  let store: Awaited<typeof import("./store.svelte")>["store"];

  beforeEach(async () => {
    localStorage.clear();
    vi.resetModules();
    vi.stubGlobal("fetch", makeFetchMock());
    const mod = await import("./store.svelte");
    store = mod.store;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("refreshAll", () => {
    it("fetches all endpoints and updates store state", async () => {
      await store.refreshAll();
      expect(store.entries).toEqual(freshEntries);
      expect(store.master).toEqual(freshMaster);
      expect(store.categories).toEqual(freshCategories);
      expect(store.breakdown).toEqual(freshBreakdown);
    });

    it("writes fetched data to cache", async () => {
      await store.refreshAll();
      const raw = localStorage.getItem("ms_cache");
      expect(raw).not.toBeNull();
      const cached = JSON.parse(raw!);
      expect(cached.entries).toEqual(freshEntries);
    });

    it("sets loading to true during fetch and false after", async () => {
      const promise = store.refreshAll();
      expect(store.loading).toBe(true);
      await promise;
      expect(store.loading).toBe(false);
    });

    it("sets error on network failure", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
      await store.refreshAll();
      expect(store.error).toBe("Network error");
      expect(store.loading).toBe(false);
    });

    it("silent mode does not set loading or error on failure", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
      await store.refreshAll(true);
      expect(store.loading).toBe(false);
      expect(store.error).toBeNull();
    });
  });

  describe("init (stale-while-revalidate)", () => {
    it("with no cache: clears loading and populates state after fetch completes", async () => {
      await store.init();
      expect(store.loading).toBe(false);
      expect(store.entries).toEqual(freshEntries);
      expect(store.error).toBeNull();
    });

    it("with cache: immediately hydrates state from cache without waiting for fetch", async () => {
      const cachedEntries: Entry[] = [
        {
          id: 99,
          date: "2025-12-01",
          tag: "Salary",
          mainCategory: "Salary",
          description: "cached",
          direction: "I",
          amount: 5000,
        },
      ];
      writeCache(makePayload({ entries: cachedEntries }));

      const initPromise = store.init();
      // cache hydration is synchronous — state is available before awaiting
      expect(store.entries).toEqual(cachedEntries);
      await initPromise;
    });

    it("with cache: silently refreshes state from fetch after init resolves", async () => {
      writeCache(makePayload({ entries: [] }));
      await store.init();
      // init resolved (cache path), silent refresh is still in-flight
      await vi.waitFor(() => {
        expect(store.entries).toEqual(freshEntries);
      });
    });
  });
});
