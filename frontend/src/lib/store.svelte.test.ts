import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeCache } from "./cache";
import { writeQueue } from "./queue";
import type { CachePayload } from "./cache";
import type { QueueItem } from "./queue";
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

function makePayload(overrides: Partial<CachePayload> = {}): CachePayload {
  return {
    entries: [],
    master: { onHand: 1000, budgets: { Food: 200 } },
    categories: { Food: ["Groceries"] },
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
      case "getConfig":
        body = { config: { currency: "₱" } };
        break;
      case "getStats":
        body = { stats: { categoryMonthChange: [], spendingPace: [] } };
        break;
      default:
        body = { error: `unknown action: ${action}` };
    }

    return Promise.resolve({ text: () => Promise.resolve(JSON.stringify(body)) });
  });
}

function gasGetBody(url: string): Record<string, unknown> {
  const qs = url.includes("?") ? url.split("?")[1] : "";
  const action = new URLSearchParams(qs).get("action");
  switch (action) {
    case "getEntries": return { entries: freshEntries };
    case "getMaster": return { master: freshMaster };
    case "getCategories": return { categories: freshCategories };
    case "getConfig": return { config: { currency: "₱" } };
    case "getStats": return { stats: { categoryMonthChange: [], spendingPace: [] } };
    default: return {};
  }
}

function makeConnectionErrorFetch() {
  return vi.fn().mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("action=")) {
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify(gasGetBody(url))) });
    }
    return Promise.reject(new Error("Network error"));
  });
}

// ---------------------------------------------------------------------------
// pendingIds (in-flight tracking — unchanged behavior)
// ---------------------------------------------------------------------------

describe("pendingIds", () => {
  let store: Awaited<typeof import("./store.svelte")>["store"];
  let toast: Awaited<typeof import("./toast.svelte")>["toast"];

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem("ms_connection", JSON.stringify({ gasUrl: "https://fake.example", apiSecret: "fake-secret" }));
    vi.resetModules();
    vi.stubGlobal("fetch", makeFetchMock());
    const mod = await import("./store.svelte");
    store = mod.store;
    toast = (await import("./toast.svelte")).toast;
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
            (url as string).includes("action=getStats") ||
            (url as string).includes("action=getConfig")) {
          return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: [], master: { onHand: 0, budgets: {} }, categories: {}, stats: { categoryMonthChange: [], spendingPace: [] } })) });
        }
        return new Promise((res) => { resolveFetch = res; });
      })
    );
    store.addEntry({ date: "2026-01-01", tag: "Food", description: "test", direction: "O", amount: 50 });
    expect(store.pendingIds.size).toBe(1);
    resolveFetch({ text: () => Promise.resolve(JSON.stringify({ entry: { id: 42, date: "2026-01-01", tag: "Food", mainCategory: "Food", description: "test", direction: "O", amount: 50 } })) });
    await vi.waitFor(() => expect(store.pendingIds.size).toBe(0));
  });

  it("updateEntry: id in pendingIds during call; cleared on success", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    await store.refreshAll();

    let resolvePost!: (v: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if ((url as string).includes("action=")) {
          return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: freshEntries, master: { onHand: 0, budgets: {} }, categories: {} })) });
        }
        return new Promise((res) => { resolvePost = res; });
      })
    );
    store.updateEntry(1, { description: "updated" });
    expect(store.pendingIds.has(1)).toBe(true);
    resolvePost({ text: () => Promise.resolve(JSON.stringify({ ok: true })) });
    await vi.waitFor(() => expect(store.pendingIds.has(1)).toBe(false));
  });

  it("updateEntry: pendingIds cleared on generic api failure + entry reverted", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    await store.refreshAll();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if ((url as string).includes("action=")) {
          return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: freshEntries, master: { onHand: 0, budgets: {} }, categories: {} })) });
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
          return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: [], master: { onHand: 0, budgets: {} }, categories: {} })) });
        }
        return new Promise((res) => { resolvePost = res; });
      })
    );
    store.deleteEntry(1);
    expect(store.entries.some((e) => e.id === 1)).toBe(true);
    expect(store.deletePendingIds.has(1)).toBe(true);
    resolvePost({ text: () => Promise.resolve(JSON.stringify({ ok: true })) });
    await vi.waitFor(() => expect(store.deletePendingIds.has(1)).toBe(false));
  });

  it("deleteEntry: entry stays + pendingIds cleared on generic api failure", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    await store.refreshAll();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if ((url as string).includes("action=")) {
          return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: freshEntries, master: { onHand: 0, budgets: {} }, categories: {} })) });
        }
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ error: "fail" })) });
      })
    );
    store.deleteEntry(1);
    await vi.waitFor(() => expect(store.deletePendingIds.has(1)).toBe(false));
    expect(store.entries.some((e) => e.id === 1)).toBe(true);
  });

  it("15s timeout: addEntry keeps entry in list, marks as local (localIds), no toast", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if ((url as string).includes("action=")) {
          return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: [], master: { onHand: 0, budgets: {} }, categories: {} })) });
        }
        return new Promise(() => {});
      })
    );
    store.addEntry({ date: "2026-01-01", tag: "Food", description: "test", direction: "O", amount: 50 });
    expect(store.entries.length).toBe(1);
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.waitFor(() => {
      expect(store.entries.length).toBe(1);
      expect(store.pendingIds.size).toBe(0);
      expect(store.localIds.size).toBe(1);
      expect(toast.msg).toBeNull();
    });
    vi.useRealTimers();
  });

  it("addEntry: on connection failure, entry stays, localIds populated (no failedIds)", async () => {
    vi.stubGlobal("fetch", makeConnectionErrorFetch());
    store.addEntry({ date: "2026-01-01", tag: "Food", description: "test", direction: "O", amount: 50 });
    await vi.waitFor(() => expect(store.pendingIds.size).toBe(0));
    expect(store.entries.length).toBe(1);
    expect(store.localIds.size).toBe(1);
    expect(toast.msg).toBeNull();
  });

  it("local entry survives a silent refreshAll that omits it from the server response", async () => {
    vi.stubGlobal("fetch", makeConnectionErrorFetch());
    store.addEntry({ date: "2026-01-01", tag: "Food", description: "test", direction: "O", amount: 50 });
    await vi.waitFor(() => expect(store.localIds.size).toBe(1));
    const [localId] = [...store.localIds];

    vi.stubGlobal("fetch", vi.fn().mockImplementation(() =>
      Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: [], master: { onHand: 0, budgets: {} }, categories: {} })) })
    ));
    await store.refreshAll(true);

    expect(store.entries.some((e) => e.id === localId)).toBe(true);
    expect(store.localIds.has(localId)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// store — refreshAll, init (stale-while-revalidate), timeout
// ---------------------------------------------------------------------------

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
            default: body = { error: `unknown action: ${action}` };
          }
          return Promise.resolve({ text: () => Promise.resolve(JSON.stringify(body)) });
        })
      );
      await store.refreshAll();
      expect(store.entries).toHaveLength(1);
      expect(store.entries[0].description).toBe("first");
    });

    it("applies entries/categories from a partial refresh when only getMaster fails transiently", async () => {
      // Mirrors the real-world GAS quirk where the 4 concurrent refreshAll
      // requests share one web-app deployment and an occasional one drops
      // (e.g. net::ERR_NETWORK_CHANGED) while the rest succeed.
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation((url: string) => {
          const qs = typeof url === "string" && url.includes("?") ? url.split("?")[1] : "";
          const action = new URLSearchParams(qs).get("action");
          if (action === "getMaster") return Promise.reject(new Error("net::ERR_NETWORK_CHANGED"));
          return Promise.resolve({ text: () => Promise.resolve(JSON.stringify(gasGetBody(url))) });
        })
      );
      await store.refreshAll(true);
      expect(store.entries).toEqual(freshEntries);
      expect(store.categories).toEqual(freshCategories);
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
      expect(store.entries).toEqual(cachedEntries);
      await initPromise;
    });

    it("with cache: silently refreshes state from fetch after init resolves", async () => {
      writeCache(makePayload({ entries: [] }));
      await store.init();
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
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise(() => {})));
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
// addEntry — split (array) path
// ---------------------------------------------------------------------------

/**
 * Returns a fetch stub for the single atomic addEntries POST a split now
 * issues. `fail: true` rejects the whole batch (network error); otherwise it
 * resolves with one entry per submitted leg, ids assigned in array order.
 */
function makeBatchPostMock({ fail = false }: { fail?: boolean } = {}) {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (typeof url === "string" && url.includes("action=")) {
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify(gasGetBody(url))) });
    }
    if (fail) return Promise.reject(new Error("Network error"));
    const body = JSON.parse(String(init?.body)) as { entries: AddEntryPayload[] };
    const entries = body.entries.map((p, i) => ({ id: 100 + i, mainCategory: "FOOD", ...p }));
    return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: true, entries })) });
  });
}

describe("addEntry — split (array) path", () => {
  let store: Awaited<typeof import("./store.svelte")>["store"];
  let toast: Awaited<typeof import("./toast.svelte")>["toast"];

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem("ms_connection", JSON.stringify({ gasUrl: "https://fake.example", apiSecret: "fake-secret" }));
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) =>
      Promise.resolve({ text: () => Promise.resolve(JSON.stringify(gasGetBody(url))) }),
    ));
    const mod = await import("./store.svelte");
    store = mod.store;
    toast = (await import("./toast.svelte")).toast;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("issues exactly one addEntries POST for the whole split, not one per leg", async () => {
    let postCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("action=")) {
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify(gasGetBody(url))) });
      }
      postCount++;
      const body = JSON.parse(String(init?.body)) as { action: string; entries: AddEntryPayload[] };
      expect(body.action).toBe("addEntries");
      const entries = body.entries.map((p, i) => ({ id: 100 + i, mainCategory: "FOOD", ...p }));
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: true, entries })) });
    }));
    await store.addEntry([
      { date: "2026-01-01", tag: "Groceries", description: "split", direction: "O", amount: 10 },
      { date: "2026-01-01", tag: "Dining", description: "^^", direction: "O", amount: 20 },
      { date: "2026-01-01", tag: "Rent", description: "^^", direction: "O", amount: 30 },
    ]);
    expect(postCount).toBe(1);
  });

  it("full success: no local entries, entries refreshed, ids assigned in array order", async () => {
    vi.stubGlobal("fetch", makeBatchPostMock());
    await store.addEntry([
      { date: "2026-01-01", tag: "Groceries", description: "split", direction: "O", amount: 10 },
      { date: "2026-01-01", tag: "Dining", description: "^^", direction: "O", amount: 20 },
    ]);
    expect(store.entries).toEqual(freshEntries);
    expect(store.localIds.size).toBe(0);
    expect(toast.msg).toBeNull();
  });

  it("batch failure: every leg stays a Local Entry — no partial success", async () => {
    vi.stubGlobal("fetch", makeBatchPostMock({ fail: true }));
    await store.addEntry([
      { date: "2026-01-01", tag: "Groceries", description: "split", direction: "O", amount: 10 },
      { date: "2026-01-01", tag: "Dining", description: "^^", direction: "O", amount: 20 },
      { date: "2026-01-01", tag: "Rent", description: "^^", direction: "O", amount: 30 },
    ]);
    expect(store.localIds.size).toBe(3);
    expect(store.entries.filter((e) => store.localIds.has(e.id))).toHaveLength(3);
  });

  it("a hung batch POST counts all legs as Local Entries after 15s withTimeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("action=")) {
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify(gasGetBody(url))) });
      }
      return new Promise<never>(() => {});
    }));
    store.addEntry([
      { date: "2026-01-01", tag: "Groceries", description: "split", direction: "O", amount: 10 },
      { date: "2026-01-01", tag: "Dining", description: "^^", direction: "O", amount: 20 },
    ]);
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.waitFor(() => expect(store.localIds.size).toBe(2));
    expect(store.entries.filter((e) => store.localIds.has(e.id))).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// errorIsConnection and toastIsConnection
// ---------------------------------------------------------------------------

describe("store — errorIsConnection and toastIsConnection", () => {
  let store: Awaited<typeof import("./store.svelte")>["store"];
  let toast: Awaited<typeof import("./toast.svelte")>["toast"];

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem(
      "ms_connection",
      JSON.stringify({ gasUrl: "https://fake.example", apiSecret: "fake-secret" }),
    );
    vi.resetModules();
    vi.stubGlobal("fetch", makeFetchMock());
    const mod = await import("./store.svelte");
    store = mod.store;
    toast = (await import("./toast.svelte")).toast;
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

  it("toastIsConnection is false when a mutation fails with a generic API error", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    await store.refreshAll();
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes("action=")) {
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: [], master: { onHand: 0, budgets: {} }, categories: {} })) });
      }
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ error: "Entry not found" })) });
    }));
    store.updateEntry(1, { description: "changed" });
    await vi.waitFor(() => expect(toast.msg).not.toBeNull());
    expect(toast.isConnection).toBe(false);
  });

  it("dismissToast resets toastIsConnection to false", async () => {
    vi.stubGlobal("fetch", makeFetchMock());
    await store.refreshAll();
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes("action=")) {
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: [], master: { onHand: 0, budgets: {} }, categories: {} })) });
      }
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ error: "Entry not found" })) });
    }));
    store.updateEntry(1, { description: "x" });
    await vi.waitFor(() => expect(toast.msg).not.toBeNull());
    toast.dismiss();
    expect(toast.isConnection).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Offline queue — addEntry failure (Slice 2)
// ---------------------------------------------------------------------------

describe("offline queue — addEntry connection failure", () => {
  let store: Awaited<typeof import("./store.svelte")>["store"];
  let toast: Awaited<typeof import("./toast.svelte")>["toast"];

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem("ms_connection", JSON.stringify({ gasUrl: "https://fake.example", apiSecret: "fake-secret" }));
    vi.resetModules();
    vi.stubGlobal("fetch", makeFetchMock());
    const mod = await import("./store.svelte");
    store = mod.store;
    toast = (await import("./toast.svelte")).toast;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("entry stays in list after connection failure", async () => {
    vi.stubGlobal("fetch", makeConnectionErrorFetch());
    store.addEntry({ date: "2026-01-01", tag: "Groceries", description: "test", direction: "O", amount: 50 });
    await vi.waitFor(() => expect(store.pendingIds.size).toBe(0));
    expect(store.entries.length).toBe(1);
  });

  it("localIds gains the tempId after connection failure", async () => {
    vi.stubGlobal("fetch", makeConnectionErrorFetch());
    store.addEntry({ date: "2026-01-01", tag: "Groceries", description: "test", direction: "O", amount: 50 });
    await vi.waitFor(() => expect(store.localIds.size).toBe(1));
    const [localId] = [...store.localIds];
    expect(localId).toBeLessThan(0); // tempId is negative
    expect(store.entries.some(e => e.id === localId)).toBe(true);
  });

  it("no toast shown — cloud indicator is the UX signal", async () => {
    vi.stubGlobal("fetch", makeConnectionErrorFetch());
    store.addEntry({ date: "2026-01-01", tag: "Groceries", description: "test", direction: "O", amount: 50 });
    await vi.waitFor(() => expect(store.localIds.size).toBe(1));
    expect(toast.msg).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Offline queue — updateEntry connection failure (Slice 3)
// ---------------------------------------------------------------------------

describe("offline queue — updateEntry connection failure", () => {
  let store: Awaited<typeof import("./store.svelte")>["store"];
  let toast: Awaited<typeof import("./toast.svelte")>["toast"];

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem("ms_connection", JSON.stringify({ gasUrl: "https://fake.example", apiSecret: "fake-secret" }));
    vi.resetModules();
    vi.stubGlobal("fetch", makeFetchMock());
    const mod = await import("./store.svelte");
    store = mod.store;
    toast = (await import("./toast.svelte")).toast;
    await store.refreshAll(); // seed entry id=1
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("entry keeps optimistic state (no rollback) after connection failure", async () => {
    vi.stubGlobal("fetch", makeConnectionErrorFetch());
    store.updateEntry(1, { description: "updated" });
    await vi.waitFor(() => expect(store.pendingIds.has(1)).toBe(false));
    expect(store.entries.find(e => e.id === 1)?.description).toBe("updated");
  });

  it("localIds gains the id after connection failure", async () => {
    vi.stubGlobal("fetch", makeConnectionErrorFetch());
    store.updateEntry(1, { description: "updated" });
    await vi.waitFor(() => expect(store.localIds.has(1)).toBe(true));
  });

  it("no toast for connection errors — queue is the recovery path", async () => {
    vi.stubGlobal("fetch", makeConnectionErrorFetch());
    store.updateEntry(1, { description: "updated" });
    await vi.waitFor(() => expect(store.localIds.has(1)).toBe(true));
    expect(toast.msg).toBeNull();
  });

  it("generic API error still rolls back and shows toast", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes("action=")) {
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify(gasGetBody(url))) });
      }
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ error: "fail" })) });
    }));
    store.updateEntry(1, { description: "updated" });
    await vi.waitFor(() => expect(toast.msg).not.toBeNull());
    expect(store.entries.find(e => e.id === 1)?.description).toBe("fresh");
    expect(store.localIds.has(1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Offline queue — deleteEntry connection failure (Slice 4)
// ---------------------------------------------------------------------------

describe("offline queue — deleteEntry connection failure", () => {
  let store: Awaited<typeof import("./store.svelte")>["store"];

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem("ms_connection", JSON.stringify({ gasUrl: "https://fake.example", apiSecret: "fake-secret" }));
    vi.resetModules();
    vi.stubGlobal("fetch", makeFetchMock());
    const mod = await import("./store.svelte");
    store = mod.store;
    await store.refreshAll(); // seed entry id=1
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("entry stays in list after connection failure", async () => {
    vi.stubGlobal("fetch", makeConnectionErrorFetch());
    store.deleteEntry(1);
    await vi.waitFor(() => expect(store.deletePendingIds.has(1)).toBe(false));
    expect(store.entries.some(e => e.id === 1)).toBe(true);
  });

  it("localIds gains the id after connection failure", async () => {
    vi.stubGlobal("fetch", makeConnectionErrorFetch());
    store.deleteEntry(1);
    await vi.waitFor(() => expect(store.localIds.has(1)).toBe(true));
  });

});


// ---------------------------------------------------------------------------
// Offline queue — edit/delete a Local Entry skips API call (Slice 5)
// ---------------------------------------------------------------------------

describe("offline queue — edit/delete a Local Entry coalesces without API call", () => {
  let store: Awaited<typeof import("./store.svelte")>["store"];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem("ms_connection", JSON.stringify({ gasUrl: "https://fake.example", apiSecret: "fake-secret" }));
    vi.resetModules();
    fetchMock = makeConnectionErrorFetch();
    vi.stubGlobal("fetch", fetchMock);
    const mod = await import("./store.svelte");
    store = mod.store;
    // Add an entry that fails → Local Entry
    store.addEntry({ date: "2026-01-01", tag: "Groceries", description: "local", direction: "O", amount: 50 });
    await vi.waitFor(() => expect(store.localIds.size).toBe(1));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("updateEntry on local entry: queue is coalesced (still 1 item), no extra fetch", async () => {
    const [localId] = [...store.localIds];
    const callsBefore = fetchMock.mock.calls.length;
    store.updateEntry(localId, { amount: 99 });
    // Give any async work a tick
    await new Promise(r => setTimeout(r, 10));
    expect(fetchMock.mock.calls.length).toBe(callsBefore); // no new fetch
    const q = JSON.parse(localStorage.getItem("ms_queue")!);
    expect(q).toHaveLength(1); // still 1 item (coalesced)
    expect(q[0].op).toBe("add");
    expect(q[0].payload.amount).toBe(99); // merged
  });

  it("deleteEntry on local entry: queue becomes empty (net zero), entry removed", async () => {
    const [localId] = [...store.localIds];
    store.deleteEntry(localId);
    await vi.waitFor(() => expect(store.localIds.size).toBe(0));
    expect(store.entries.some(e => e.id === localId)).toBe(false);
    const q = JSON.parse(localStorage.getItem("ms_queue") ?? "[]");
    expect(q).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// drainQueue (Slice 6)
// ---------------------------------------------------------------------------

describe("drainQueue", () => {
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

  it("drains an add item: temp entry replaced by real entry, queue emptied", async () => {
    // Seed a Local Entry via failed add
    vi.stubGlobal("fetch", makeConnectionErrorFetch());
    store.addEntry({ date: "2026-01-01", tag: "Groceries", description: "queued", direction: "O", amount: 50 });
    await vi.waitFor(() => expect(store.localIds.size).toBe(1));
    const [tempId] = [...store.localIds];

    // Now drain with successful fetch
    const realEntry = { id: 77, date: "2026-01-01", tag: "Groceries", mainCategory: "FOOD", description: "queued", direction: "O", amount: 50 };
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes("action=")) {
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: [realEntry], master: freshMaster, categories: freshCategories })) });
      }
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: true, entry: realEntry })) });
    }));
    await store.drainQueue();

    expect(store.localIds.size).toBe(0);
    expect(store.entries.some(e => e.id === tempId)).toBe(false);
    expect(store.entries.some(e => e.id === 77)).toBe(true);
    expect(JSON.parse(localStorage.getItem("ms_queue") ?? "[]")).toHaveLength(0);
  });

  it("drains an edit item: queue emptied, entry retains updated state", async () => {
    await store.refreshAll(); // seed id=1 with description="fresh"

    // Seed edit in queue via connection failure
    vi.stubGlobal("fetch", makeConnectionErrorFetch());
    store.updateEntry(1, { description: "queued-edit" });
    await vi.waitFor(() => expect(store.localIds.has(1)).toBe(true));

    // Drain successfully
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes("action=")) {
        const updated = [{ ...freshEntries[0], description: "queued-edit" }];
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: updated, master: freshMaster, categories: freshCategories })) });
      }
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: true })) });
    }));
    await store.drainQueue();

    expect(store.localIds.size).toBe(0);
    expect(JSON.parse(localStorage.getItem("ms_queue") ?? "[]")).toHaveLength(0);
    expect(store.entries.find(e => e.id === 1)?.description).toBe("queued-edit");
  });

  it("drains a delete item: entry removed from list, queue emptied", async () => {
    await store.refreshAll(); // seed id=1

    // Seed delete in queue via connection failure
    vi.stubGlobal("fetch", makeConnectionErrorFetch());
    store.deleteEntry(1);
    await vi.waitFor(() => expect(store.localIds.has(1)).toBe(true));

    // Drain successfully
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes("action=")) {
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: [], master: freshMaster, categories: freshCategories })) });
      }
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: true })) });
    }));
    await store.drainQueue();

    expect(store.localIds.size).toBe(0);
    expect(store.entries.some(e => e.id === 1)).toBe(false);
    expect(JSON.parse(localStorage.getItem("ms_queue") ?? "[]")).toHaveLength(0);
  });

  it("drain stops at the first failure; successfully drained items are committed", async () => {
    // Pre-seed two queue items: first will succeed, second will fail
    const addPayload1 = { date: "2026-01-01", tag: "Groceries", description: "first", direction: "O" as const, amount: 10 };
    const addPayload2 = { date: "2026-01-02", tag: "Dining", description: "second", direction: "O" as const, amount: 20 };
    writeQueue([
      { op: "add", tempId: -1001, payload: addPayload1 },
      { op: "add", tempId: -1002, payload: addPayload2 },
    ]);
    // Re-import to pick up pre-seeded queue
    vi.resetModules();
    localStorage.setItem("ms_connection", JSON.stringify({ gasUrl: "https://fake.example", apiSecret: "fake-secret" }));
    const real1 = { id: 101, date: "2026-01-01", tag: "Groceries", mainCategory: "FOOD", description: "first", direction: "O", amount: 10 };
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes("action=")) {
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: [real1], master: freshMaster, categories: freshCategories })) });
      }
      callCount++;
      if (callCount === 1) return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: true, entry: real1 })) });
      return Promise.reject(new Error("Network error")); // 2nd POST fails
    }));
    const mod = await import("./store.svelte");
    store = mod.store;

    await store.drainQueue();

    expect(store.localIds.has(-1001)).toBe(false); // first drained
    expect(store.localIds.has(-1002)).toBe(true);  // second still local
  });
});

// ---------------------------------------------------------------------------
// online event triggers drainQueue (Slice 7)
// ---------------------------------------------------------------------------

describe("online event triggers drainQueue", () => {
  let store: Awaited<typeof import("./store.svelte")>["store"];

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem("ms_connection", JSON.stringify({ gasUrl: "https://fake.example", apiSecret: "fake-secret" }));
    vi.resetModules();
    vi.stubGlobal("fetch", makeFetchMock());
    const mod = await import("./store.svelte");
    store = mod.store;
    await store.init();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dispatching window 'online' event drains the queue", async () => {
    // Seed a local entry
    vi.stubGlobal("fetch", makeConnectionErrorFetch());
    store.addEntry({ date: "2026-01-01", tag: "Groceries", description: "offline", direction: "O", amount: 50 });
    await vi.waitFor(() => expect(store.localIds.size).toBe(1));

    // Restore connectivity
    const realEntry = { id: 99, date: "2026-01-01", tag: "Groceries", mainCategory: "FOOD", description: "offline", direction: "O", amount: 50 };
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes("action=")) {
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ entries: [realEntry], master: freshMaster, categories: freshCategories })) });
      }
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: true, entry: realEntry })) });
    }));

    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(store.localIds.size).toBe(0));
    expect(store.entries.some(e => e.id === 99)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// init with existing queue (Slice 8)
// ---------------------------------------------------------------------------

describe("init with existing queue", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("init injects Local Entry from a queued add item on cache path", async () => {
    const payload = { date: "2026-01-01", tag: "Groceries", description: "queued", direction: "O" as const, amount: 50 };
    writeQueue([{ op: "add", tempId: -9999, payload }]);
    writeCache({
      entries: freshEntries,
      master: freshMaster,
      categories: freshCategories,
    });
    localStorage.setItem("ms_connection", JSON.stringify({ gasUrl: "https://fake.example", apiSecret: "fake-secret" }));
    vi.resetModules();
    vi.stubGlobal("fetch", makeFetchMock());
    const { store } = await import("./store.svelte");

    const initPromise = store.init();
    // synchronous cache hydration: local entry should be present immediately
    expect(store.entries.some(e => e.id === -9999)).toBe(true);
    expect(store.localIds.has(-9999)).toBe(true);
    await initPromise;
  });
});

// ---------------------------------------------------------------------------
// refreshAll re-applies queued edit patch (Slice 9)
// ---------------------------------------------------------------------------

describe("refreshAll preserves local state", () => {
  let store: Awaited<typeof import("./store.svelte")>["store"];

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem("ms_connection", JSON.stringify({ gasUrl: "https://fake.example", apiSecret: "fake-secret" }));
    vi.resetModules();
    vi.stubGlobal("fetch", makeFetchMock());
    const mod = await import("./store.svelte");
    store = mod.store;
    await store.refreshAll(); // seed id=1 description="fresh"
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("silent refreshAll re-applies a queued edit patch on top of fetched data", async () => {
    // Trigger edit failure → enqueue
    vi.stubGlobal("fetch", makeConnectionErrorFetch());
    store.updateEntry(1, { description: "local-edit" });
    await vi.waitFor(() => expect(store.localIds.has(1)).toBe(true));

    // Silent refresh fetches OLD data from GAS (description="fresh"), but patch re-applied
    vi.stubGlobal("fetch", makeFetchMock()); // returns freshEntries (description="fresh")
    await store.refreshAll(true);

    // Entry should still reflect the queued edit
    expect(store.entries.find(e => e.id === 1)?.description).toBe("local-edit");
    expect(store.localIds.has(1)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// deleteEntries — multi-delete (Slice 10)
// ---------------------------------------------------------------------------

describe("store — deleteEntries", () => {
  let store: Awaited<typeof import("./store.svelte")>["store"];

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem("ms_connection", JSON.stringify({ gasUrl: "https://fake.example", apiSecret: "fake-secret" }));
    vi.resetModules();
    vi.stubGlobal("fetch", makeFetchMock());
    const mod = await import("./store.svelte");
    store = mod.store;
    await store.refreshAll(); // seeds entries: [{ id: 1, description: "fresh" }]
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("removes confirmed remote entries from store on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("action=")) {
        const qs = url.split("?")[1] || "";
        const action = new URLSearchParams(qs).get("action");
        const data = action === "getEntries" ? { entries: [] } : gasGetBody(url);
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify(data)) });
      }
      return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ ok: true })) });
    }));
    await store.deleteEntries([1]);
    expect(store.entries.some((e) => e.id === 1)).toBe(false);
  });

  it("is a no-op when none of the given IDs match entries", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await store.deleteEntries([999, 888]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(store.entries).toEqual(freshEntries);
  });
});

// ---------------------------------------------------------------------------
// getStats graceful degradation (#129/#130) — a stats read is non-fatal.
// STATS drives only the Summary envelope direction/pace numbers; a failure
// there must NOT gate the connection-error state the way a core read does,
// and must leave the last-good stats in place rather than surfacing an error.
// ---------------------------------------------------------------------------

describe("store — getStats graceful degradation", () => {
  let store: Awaited<typeof import("./store.svelte")>["store"];

  // fetch that succeeds for every read EXCEPT getStats, which rejects with a
  // network-shaped (queueable) error — the strongest case, since a core read
  // failing that way WOULD set errorIsConnection.
  function makeStatsOnlyFailureFetch() {
    return vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("action=getStats")) {
        return Promise.reject(new Error("Network error"));
      }
      if (typeof url === "string" && url.includes("action=")) {
        return Promise.resolve({ text: () => Promise.resolve(JSON.stringify(gasGetBody(url))) });
      }
      return Promise.reject(new Error("unexpected non-action fetch"));
    });
  }

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem(
      "ms_connection",
      JSON.stringify({ gasUrl: "https://fake.example", apiSecret: "fake-secret" }),
    );
    vi.resetModules();
    vi.stubGlobal("fetch", makeStatsOnlyFailureFetch());
    store = (await import("./store.svelte")).store;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not surface an error when only getStats fails", async () => {
    await store.refreshAll(false);
    expect(store.error).toBeNull();
    expect(store.errorIsConnection).toBe(false);
  });

  it("still loads the core reads when getStats fails", async () => {
    await store.refreshAll(false);
    expect(store.entries).toEqual(freshEntries);
    expect(store.master).toEqual(freshMaster);
    expect(store.categories).toEqual(freshCategories);
  });

  it("keeps the last-good (default) stats rather than corrupting them on failure", async () => {
    await store.refreshAll(false);
    expect(store.stats).toEqual({
      categoryMonthChange: [],
      spendingPace: [],
      windowTotals: [],
      windowCategorySpend: [],
    });
  });
});
