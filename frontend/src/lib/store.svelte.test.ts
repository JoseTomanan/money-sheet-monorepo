import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeCache } from "./cache";
import type { CachePayload } from "./cache";
import type { Entry, AddEntryPayload } from "./types";

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

const dupEntries: Entry[] = [
  {
    id: 30,
    date: "2026-01-10",
    tag: "Groceries",
    mainCategory: "Food",
    description: "first",
    direction: "O",
    amount: 50,
  },
  {
    id: 30,
    date: "2026-01-11",
    tag: "Groceries",
    mainCategory: "Food",
    description: "duplicate",
    direction: "O",
    amount: 75,
  },
];

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

describe("pendingIds", () => {
  let store: Awaited<typeof import("./store.svelte")>["store"];

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem("ms_connection", JSON.stringify({ gasUrl: "https://fake.example", apiSecret: "fake-secret" }));
    vi.resetModules();
    vi.stubGlobal("fetch", makeFetchMock());
    const mod = await import("./store.svelte");
    store = mod.store;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts empty", () => {
    expect(store.pendingIds.size).toBe(0);
  });

  it("addEntry: a pending id exists while the api call is in-flight", async () => {
    let resolveFetch!: (v: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if ((url as string).includes("action=getEntries") ||
            (url as string).includes("action=getMaster") ||
            (url as string).includes("action=getCategories") ||
            (url as string).includes("action=getSubcategoryBreakdown")) {
          return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: [], master: { onHand: 0, budgets: {} }, categories: {}, breakdown: {} })) });
        }
        return new Promise((res) => { resolveFetch = res; });
      })
    );
    store.addEntry({ date: "2026-01-01", tag: "Food", description: "test", direction: "O", amount: 50 });
    // one pending id (the tempId) while fetch is in-flight
    expect(store.pendingIds.size).toBe(1);
    // settle
    resolveFetch({ text: () => Promise.resolve(JSON.stringify({ entry: { id: 42, date: "2026-01-01", tag: "Food", mainCategory: "Food", description: "test", direction: "O", amount: 50 } })) });
    await vi.waitFor(() => expect(store.pendingIds.size).toBe(0));
  });

  it("updateEntry: id in pendingIds during call; cleared on success", async () => {
    // seed the store with an existing entry
    vi.stubGlobal("fetch", makeFetchMock());
    await store.refreshAll();
    // freshEntries[0].id === 1

    let resolvePost!: (v: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if ((url as string).includes("action=")) {
          return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: freshEntries, master: { onHand: 0, budgets: {} }, categories: {}, breakdown: {} })) });
        }
        return new Promise((res) => { resolvePost = res; });
      })
    );
    store.updateEntry(1, { description: "updated" });
    expect(store.pendingIds.has(1)).toBe(true);
    resolvePost({ text: () => Promise.resolve(JSON.stringify({ ok: true })) });
    await vi.waitFor(() => expect(store.pendingIds.has(1)).toBe(false));
  });

  it("updateEntry: pendingIds cleared on failure + entry reverted", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    await store.refreshAll();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if ((url as string).includes("action=")) {
          return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: freshEntries, master: { onHand: 0, budgets: {} }, categories: {}, breakdown: {} })) });
        }
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ error: "fail" })) });
      })
    );
    store.updateEntry(1, { description: "updated" });
    await vi.waitFor(() => expect(store.pendingIds.has(1)).toBe(false));
    expect(store.entries.find((e) => e.id === 1)?.description).toBe("fresh");
  });

  it("deleteEntry: entry stays visible while pending; removed on success", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    await store.refreshAll();

    let resolvePost!: (v: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if ((url as string).includes("action=")) {
          // refresh returns no entries (simulates deletion confirmed)
          return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: [], master: { onHand: 0, budgets: {} }, categories: {}, breakdown: {} })) });
        }
        return new Promise((res) => { resolvePost = res; });
      })
    );
    store.deleteEntry(1);
    // entry must still be visible while the API call is in-flight
    expect(store.entries.some((e) => e.id === 1)).toBe(true);
    expect(store.pendingIds.has(1)).toBe(true);
    // resolve the delete
    resolvePost({ text: () => Promise.resolve(JSON.stringify({ ok: true })) });
    await vi.waitFor(() => expect(store.pendingIds.has(1)).toBe(false));
  });

  it("deleteEntry: entry stays + pendingIds cleared on failure", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    await store.refreshAll();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if ((url as string).includes("action=")) {
          return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: freshEntries, master: { onHand: 0, budgets: {} }, categories: {}, breakdown: {} })) });
        }
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ error: "fail" })) });
      })
    );
    store.deleteEntry(1);
    await vi.waitFor(() => expect(store.pendingIds.has(1)).toBe(false));
    expect(store.entries.some((e) => e.id === 1)).toBe(true);
  });

  it("15s timeout: addEntry keeps entry in list, marks failed, clears pending, no toast", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if ((url as string).includes("action=")) {
          return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: [], master: { onHand: 0, budgets: {} }, categories: {}, breakdown: {} })) });
        }
        // never resolves — simulates a hung request
        return new Promise(() => {});
      })
    );
    store.addEntry({ date: "2026-01-01", tag: "Food", description: "test", direction: "O", amount: 50 });
    expect(store.entries.length).toBe(1); // optimistic add
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.waitFor(() => {
      expect(store.entries.length).toBe(1);       // entry stays
      expect(store.pendingIds.size).toBe(0);      // no longer pending
      expect(store.failedIds.size).toBe(1);       // marked as failed
      expect(store.toastMsg).toBeNull();           // no toast — card shows the error
    });
    vi.useRealTimers();
  });

  it("addEntry: on api failure, entry stays, pendingIds cleared, failedIds populated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if ((url as string).includes("action=")) {
          return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: [], master: { onHand: 0, budgets: {} }, categories: {}, breakdown: {} })) });
        }
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ error: "fail" })) });
      })
    );
    store.addEntry({ date: "2026-01-01", tag: "Food", description: "test", direction: "O", amount: 50 });
    await vi.waitFor(() => expect(store.pendingIds.size).toBe(0));
    expect(store.entries.length).toBe(1);         // entry stays
    expect(store.failedIds.size).toBe(1);         // marked as failed
    expect(store.toastMsg).toBeNull();
  });

  it("retryEntry: clears failedIds, re-pends, replaces temp row on success", async () => {
    // Stage: add one entry that fails
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if ((url as string).includes("action=")) {
          return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: [], master: { onHand: 0, budgets: {} }, categories: {}, breakdown: {} })) });
        }
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ error: "fail" })) });
      })
    );
    store.addEntry({ date: "2026-01-01", tag: "Food", description: "test", direction: "O", amount: 50 });
    await vi.waitFor(() => expect(store.failedIds.size).toBe(1));
    const [failedId] = [...store.failedIds];

    // Retry succeeds
    const realEntry = { id: 77, date: "2026-01-01", tag: "Food", mainCategory: "Food", description: "test", direction: "O", amount: 50 };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if ((url as string).includes("action=")) {
          return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: [realEntry], master: { onHand: 0, budgets: {} }, categories: {}, breakdown: {} })) });
        }
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: true, entry: realEntry })) });
      })
    );
    store.retryEntry(failedId);
    expect(store.failedIds.size).toBe(0);          // no longer failed
    expect(store.pendingIds.size).toBe(1);          // back to pending
    await vi.waitFor(() => {
      expect(store.failedIds.size).toBe(0);
      expect(store.pendingIds.size).toBe(0);
      expect(store.entries.some((e) => e.id === realEntry.id)).toBe(true);
    });
  });

  it("retryEntry: second failure re-marks entry as failed with no data loss", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if ((url as string).includes("action=")) {
          return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: [], master: { onHand: 0, budgets: {} }, categories: {}, breakdown: {} })) });
        }
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ error: "fail" })) });
      })
    );
    store.addEntry({ date: "2026-01-01", tag: "Food", description: "test", direction: "O", amount: 50 });
    await vi.waitFor(() => expect(store.failedIds.size).toBe(1));
    const [failedId] = [...store.failedIds];

    // Retry also fails
    store.retryEntry(failedId);
    await vi.waitFor(() => expect(store.failedIds.size).toBe(1));
    expect(store.entries.length).toBe(1);           // entry still present
    expect(store.pendingIds.size).toBe(0);
    expect([...store.failedIds][0]).toBe(failedId);
  });

  it("dismissFailedEntry: removes entry from list and clears failedIds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if ((url as string).includes("action=")) {
          return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: [], master: { onHand: 0, budgets: {} }, categories: {}, breakdown: {} })) });
        }
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ error: "fail" })) });
      })
    );
    store.addEntry({ date: "2026-01-01", tag: "Food", description: "test", direction: "O", amount: 50 });
    await vi.waitFor(() => expect(store.failedIds.size).toBe(1));
    const [failedId] = [...store.failedIds];
    store.dismissFailedEntry(failedId);
    expect(store.entries.length).toBe(0);
    expect(store.failedIds.size).toBe(0);
  });

  it("failed entry survives a silent refreshAll that omits it from the server response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if ((url as string).includes("action=")) {
          return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: [], master: { onHand: 0, budgets: {} }, categories: {}, breakdown: {} })) });
        }
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ error: "fail" })) });
      })
    );
    store.addEntry({ date: "2026-01-01", tag: "Food", description: "test", direction: "O", amount: 50 });
    await vi.waitFor(() => expect(store.failedIds.size).toBe(1));
    const [failedId] = [...store.failedIds];

    // Trigger a silent refresh — server returns no entries (omits our failed one)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: [], master: { onHand: 0, budgets: {} }, categories: {}, breakdown: {} })) });
      })
    );
    await store.refreshAll(true);

    // Failed entry must still be in the list
    expect(store.entries.some((e) => e.id === failedId)).toBe(true);
    expect(store.failedIds.has(failedId)).toBe(true);
  });
});

describe("store", () => {
  let store: Awaited<typeof import("./store.svelte")>["store"];

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem("ms_connection", JSON.stringify({ gasUrl: "https://fake.example", apiSecret: "fake-secret" }));
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

    it("dedupes entries with duplicate IDs, keeping first occurrence", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string) => {
          const qs = typeof url === "string" && url.includes("?") ? url.split("?")[1] : "";
          const action = new URLSearchParams(qs).get("action");
          let body: Record<string, unknown>;
          switch (action) {
            case "getEntries": body = { entries: dupEntries }; break;
            case "getMaster": body = { master: freshMaster }; break;
            case "getCategories": body = { categories: freshCategories }; break;
            case "getSubcategoryBreakdown": body = { breakdown: freshBreakdown }; break;
            default: body = { error: `unknown action: ${action}` };
          }
          return Promise.resolve({ text: () => Promise.resolve(JSON.stringify(body)) });
        })
      );
      await store.refreshAll();
      expect(store.entries).toHaveLength(1);
      expect(store.entries[0].description).toBe("first");
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

    it("dedupes entries hydrated from a corrupt cache", async () => {
      writeCache(makePayload({ entries: dupEntries }));
      const initPromise = store.init();
      expect(store.entries).toHaveLength(1);
      expect(store.entries[0].description).toBe("first");
      await initPromise;
    });
  });
});

describe("refreshAll timeout", () => {
  let store: Awaited<typeof import("./store.svelte")>["store"];

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem("ms_connection", JSON.stringify({ gasUrl: "https://fake.example", apiSecret: "fake-secret" }));
    vi.useFakeTimers();
    vi.resetModules();
    // stub fetch AFTER resetModules so the freshly imported module picks it up
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise(() => {/* never resolves */})));
    const mod = await import("./store.svelte");
    store = mod.store;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("cold start: sets error and clears loading after 15 s with no response", async () => {
    const initPromise = store.init();
    await vi.advanceTimersByTimeAsync(15_000);
    await initPromise;
    expect(store.loading).toBe(false);
    expect(store.error).toMatch(/timed out/i);
  });

  it("cold start: happy path resolves without error within timeout window", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    vi.useRealTimers();
    vi.resetModules();
    const mod = await import("./store.svelte");
    store = mod.store;
    await store.init();
    expect(store.error).toBeNull();
    expect(store.entries).toEqual(freshEntries);
    expect(store.master).toEqual(freshMaster);
    expect(store.categories).toEqual(freshCategories);
    expect(store.breakdown).toEqual(freshBreakdown);
  });

  it("silent refresh: timeout does not set loading or error", async () => {
    const p = store.refreshAll(true);
    await vi.advanceTimersByTimeAsync(15_000);
    await p;
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Helpers shared by the split-path describe block
// ---------------------------------------------------------------------------

function gasGetBody(url: string): Record<string, unknown> {
  const qs = url.includes("?") ? url.split("?")[1] : "";
  const action = new URLSearchParams(qs).get("action");
  switch (action) {
    case "getEntries": return { entries: freshEntries };
    case "getMaster": return { master: freshMaster };
    case "getCategories": return { categories: freshCategories };
    case "getSubcategoryBreakdown": return { breakdown: freshBreakdown };
    default: return {};
  }
}

/** Returns a fetch stub where POSTs at the given indices fail with { error }. */
function makePostMock(failAtIndices: number[] = []) {
  let postIdx = 0;
  return vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("action=")) {
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify(gasGetBody(url))) });
    }
    const i = postIdx++;
    if (failAtIndices.includes(i)) {
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ error: "server error" })) });
    }
    const entry = { id: 100 + i, date: "2026-01-01", tag: "Groceries", mainCategory: "FOOD", description: "split", direction: "O", amount: 10 + i };
    return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: true, entry })) });
  });
}

describe("addEntry — split (array) path", () => {
  let store: Awaited<typeof import("./store.svelte")>["store"];

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem("ms_connection", JSON.stringify({ gasUrl: "https://fake.example", apiSecret: "fake-secret" }));
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) =>
      Promise.resolve({ text: () => Promise.resolve(JSON.stringify(gasGetBody(url))) }),
    ));
    const mod = await import("./store.svelte");
    store = mod.store;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("partial failure: toast shows 'Saved N of M', toastAction set, refreshAll runs", async () => {
    vi.stubGlobal("fetch", makePostMock([1])); // 2nd POST fails
    const payloads: AddEntryPayload[] = [
      { date: "2026-01-01", tag: "Groceries", description: "split", direction: "O", amount: 10 },
      { date: "2026-01-01", tag: "Dining", description: "split", direction: "O", amount: 20 },
      { date: "2026-01-01", tag: "Rent", description: "split", direction: "O", amount: 30 },
    ];
    store.addEntry(payloads);
    await vi.waitFor(() => expect(store.toastMsg).toBe("Saved 2 of 3 entries"));
    expect(store.toastAction?.label).toBe("Retry");
    expect(store.entries).toEqual(freshEntries); // refreshAll ran despite partial failure
  });

  it("Retry re-submits only failed legs; clears toast on full success", async () => {
    vi.stubGlobal("fetch", makePostMock([1])); // 2nd of 2 fails
    store.addEntry([
      { date: "2026-01-01", tag: "Groceries", description: "split", direction: "O", amount: 10 },
      { date: "2026-01-01", tag: "Dining", description: "split", direction: "O", amount: 20 },
    ]);
    await vi.waitFor(() => expect(store.toastMsg).toBe("Saved 1 of 2 entries"));
    vi.stubGlobal("fetch", makePostMock([])); // next round: all succeed
    store.toastAction!.run();
    await vi.waitFor(() => expect(store.toastMsg).toBeNull());
    expect(store.toastAction).toBeNull();
  });

  it("all legs fail: 'Couldn't save entries' + toastAction set", async () => {
    vi.stubGlobal("fetch", makePostMock([0, 1, 2]));
    store.addEntry([
      { date: "2026-01-01", tag: "Groceries", description: "split", direction: "O", amount: 10 },
      { date: "2026-01-01", tag: "Dining", description: "split", direction: "O", amount: 20 },
      { date: "2026-01-01", tag: "Rent", description: "split", direction: "O", amount: 30 },
    ]);
    await vi.waitFor(() => expect(store.toastMsg).toBe("Couldn't save entries"));
    expect(store.toastAction?.label).toBe("Retry");
  });

  it("full success: no toast, entries refreshed", async () => {
    vi.stubGlobal("fetch", makePostMock([]));
    store.addEntry([
      { date: "2026-01-01", tag: "Groceries", description: "split", direction: "O", amount: 10 },
      { date: "2026-01-01", tag: "Dining", description: "split", direction: "O", amount: 20 },
    ]);
    await vi.waitFor(() => expect(store.entries).toEqual(freshEntries));
    expect(store.toastMsg).toBeNull();
    expect(store.toastAction).toBeNull();
  });

  it("actionable toast persists past 3s auto-dismiss window", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", makePostMock([0])); // 1st fails → partial
    store.addEntry([
      { date: "2026-01-01", tag: "Groceries", description: "split", direction: "O", amount: 10 },
      { date: "2026-01-01", tag: "Dining", description: "split", direction: "O", amount: 20 },
    ]);
    await vi.advanceTimersByTimeAsync(500); // flush the allSettled chain
    expect(store.toastMsg).toBe("Saved 1 of 2 entries");
    await vi.advanceTimersByTimeAsync(3_000); // plain toast would have cleared
    expect(store.toastMsg).toBe("Saved 1 of 2 entries"); // still persists
  });

  it("hung leg counted as failed after 15s withTimeout", async () => {
    vi.useFakeTimers();
    let postIdx = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("action=")) {
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify(gasGetBody(url))) });
      }
      const i = postIdx++;
      if (i === 0) return new Promise<never>(() => {}); // hangs forever
      const entry = { id: 101, date: "2026-01-01", tag: "Dining", mainCategory: "FOOD", description: "split", direction: "O", amount: 20 };
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: true, entry })) });
    }));
    store.addEntry([
      { date: "2026-01-01", tag: "Groceries", description: "split", direction: "O", amount: 10 },
      { date: "2026-01-01", tag: "Dining", description: "split", direction: "O", amount: 20 },
    ]);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(store.toastMsg).toBeNull(); // still waiting for hung leg
    await vi.advanceTimersByTimeAsync(1); // fires 15s timeout
    await vi.waitFor(() => expect(store.toastMsg).toBe("Saved 1 of 2 entries"));
  });

  it("repeated partial retry: toast updates count on each failed retry", async () => {
    vi.stubGlobal("fetch", makePostMock([0])); // 1st of 2 fails → "Saved 1 of 2"
    store.addEntry([
      { date: "2026-01-01", tag: "Groceries", description: "split", direction: "O", amount: 10 },
      { date: "2026-01-01", tag: "Dining", description: "split", direction: "O", amount: 20 },
    ]);
    await vi.waitFor(() => expect(store.toastMsg).toBe("Saved 1 of 2 entries"));
    vi.stubGlobal("fetch", makePostMock([0])); // retry also fails → "Couldn't save entries"
    store.toastAction!.run();
    await vi.waitFor(() => expect(store.toastMsg).toBe("Couldn't save entries"));
    expect(store.toastAction).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// errorIsConnection and toastIsConnection
// ---------------------------------------------------------------------------

describe("store — errorIsConnection and toastIsConnection", () => {
  let store: Awaited<typeof import("./store.svelte")>["store"];

  beforeEach(async () => {
    localStorage.clear();
    // seed connection so api.ts can reach the (mocked) GAS URL after GREEN
    localStorage.setItem(
      "ms_connection",
      JSON.stringify({ gasUrl: "https://fake.example", apiSecret: "fake-secret" }),
    );
    vi.resetModules();
    vi.stubGlobal("fetch", makeFetchMock());
    const mod = await import("./store.svelte");
    store = mod.store;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("errorIsConnection is true when refreshAll catches a network/connection failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    await store.refreshAll(false);
    expect(store.errorIsConnection).toBe(true);
  });

  it("errorIsConnection is false when refreshAll catches a generic API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ error: "server blew up" })),
    }));
    await store.refreshAll(false);
    expect(store.errorIsConnection).toBe(false);
  });

  it("errorIsConnection resets to false at the start of each non-silent refreshAll", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    await store.refreshAll(false);
    expect(store.errorIsConnection).toBe(true);

    vi.stubGlobal("fetch", makeFetchMock());
    await store.refreshAll(false);
    expect(store.errorIsConnection).toBe(false);
    expect(store.error).toBeNull();
  });

  it("toastIsConnection is true when a mutation fails with a connection-class error", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    await store.refreshAll();
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes("action=")) {
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: [], master: { onHand: 0, budgets: {} }, categories: {}, breakdown: {} })) });
      }
      return Promise.reject(new Error("Network error"));
    }));
    store.updateEntry(1, { description: "changed" });
    await vi.waitFor(() => expect(store.toastMsg).not.toBeNull());
    expect(store.toastIsConnection).toBe(true);
  });

  it("toastIsConnection is false when a mutation fails with a generic API error", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    await store.refreshAll();
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes("action=")) {
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: [], master: { onHand: 0, budgets: {} }, categories: {}, breakdown: {} })) });
      }
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ error: "Entry not found" })) });
    }));
    store.updateEntry(1, { description: "changed" });
    await vi.waitFor(() => expect(store.toastMsg).not.toBeNull());
    expect(store.toastIsConnection).toBe(false);
  });

  it("dismissToast resets toastIsConnection to false", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    await store.refreshAll();
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes("action=")) {
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: [], master: { onHand: 0, budgets: {} }, categories: {}, breakdown: {} })) });
      }
      return Promise.reject(new Error("down"));
    }));
    store.updateEntry(1, { description: "x" });
    await vi.waitFor(() => expect(store.toastIsConnection).toBe(true));
    store.dismissToast();
    expect(store.toastIsConnection).toBe(false);
  });
});
