import { describe, it, expect, afterEach, vi } from "vitest";
import type { AddEntryPayload } from "./types";

const FAKE_GAS_URL = "https://fake.gas.example";
const FAKE_SECRET = "test-api-secret";
const FAKE_CONN = { gasUrl: FAKE_GAS_URL, apiSecret: FAKE_SECRET };

async function freshMods(preSet?: () => void) {
  localStorage.clear();
  // Simulate a returning user (dismissed mock mode) so these tests exercise RealAdapter.
  localStorage.setItem("ms_mock_dismissed", "1");
  if (preSet) preSet();
  vi.resetModules();
  const connMod = await import("./connection.svelte");
  const apiMod = await import("./api");
  return { connection: connMod.connection, setConnection: connMod.setConnection, api: apiMod };
}

async function freshModsFirstVisitor() {
  localStorage.clear();
  vi.resetModules();
  const connMod = await import("./connection.svelte");
  const apiMod = await import("./api");
  return { connection: connMod.connection, setConnection: connMod.setConnection, api: apiMod };
}

async function freshModsWithConn() {
  return freshMods(() => {
    localStorage.setItem("ms_connection", JSON.stringify(FAKE_CONN));
  });
}

describe("api — ConnectionMissingError when connection is null", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("getEntries throws ConnectionMissingError", async () => {
    const { api } = await freshMods();
    await expect(api.getEntries()).rejects.toBeInstanceOf(api.ConnectionMissingError);
  });

  it("addEntry throws ConnectionMissingError", async () => {
    const { api } = await freshMods();
    const payload: AddEntryPayload = { date: "2026-01-01", tag: "Food", description: "t", direction: "O", amount: 10 };
    await expect(api.addEntry(payload)).rejects.toBeInstanceOf(api.ConnectionMissingError);
  });

  it("ConnectionMissingError is instanceof ConnectionError", async () => {
    const { api } = await freshMods();
    try {
      await api.getEntries();
    } catch (e) {
      expect(e).toBeInstanceOf(api.ConnectionError);
    }
    expect.hasAssertions();
  });
});

describe("api — error classification with connection set", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("network failure (fetch rejects) throws ConnectionError", async () => {
    const { api } = await freshModsWithConn();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(api.getEntries()).rejects.toBeInstanceOf(api.ConnectionError);
  });

  it("non-JSON response throws ConnectionError", async () => {
    const { api } = await freshModsWithConn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      text: () => Promise.resolve("<!DOCTYPE html><body>Not Found</body>"),
    }));
    await expect(api.getEntries()).rejects.toBeInstanceOf(api.ConnectionError);
  });

  it("json.error === 'unauthorized' throws ConnectionError", async () => {
    const { api } = await freshModsWithConn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ error: "unauthorized" })),
    }));
    await expect(api.getEntries()).rejects.toBeInstanceOf(api.ConnectionError);
  });

  it("generic json.error throws plain Error (not ConnectionError)", async () => {
    const { api } = await freshModsWithConn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ error: "Entry 5 not found" })),
    }));
    const err = await api.getEntries().catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(api.ConnectionError);
    expect(err.message).toBe("Entry 5 not found");
  });
});

describe("api — uses Connection values at call time", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("gasGet uses conn.gasUrl in the fetch URL", async () => {
    const { api } = await freshModsWithConn();
    const fetchMock = vi.fn().mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ entries: [] })),
    });
    vi.stubGlobal("fetch", fetchMock);
    await api.getEntries();
    expect((fetchMock.mock.calls[0][0] as string).startsWith(FAKE_GAS_URL)).toBe(true);
  });

  it("gasPost includes conn.apiSecret in the POST body", async () => {
    const { api } = await freshModsWithConn();
    const entry = { id: 1, date: "2026-01-01", tag: "Food", mainCategory: "FOOD", description: "t", direction: "O" as const, amount: 10 };
    const fetchMock = vi.fn().mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ ok: true, entry })),
    });
    vi.stubGlobal("fetch", fetchMock);
    await api.addEntry({ date: "2026-01-01", tag: "Food", description: "t", direction: "O", amount: 10 });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.secret).toBe(FAKE_SECRET);
  });

  it("gasPost posts to conn.gasUrl", async () => {
    const { api } = await freshModsWithConn();
    const entry = { id: 1, date: "2026-01-01", tag: "Food", mainCategory: "FOOD", description: "t", direction: "O" as const, amount: 10 };
    const fetchMock = vi.fn().mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ ok: true, entry })),
    });
    vi.stubGlobal("fetch", fetchMock);
    await api.addEntry({ date: "2026-01-01", tag: "Food", description: "t", direction: "O", amount: 10 });
    expect(fetchMock.mock.calls[0][0]).toBe(FAKE_GAS_URL);
  });
});

// ── Cycle 9: runtime Mock Mode wires MockAdapter for first-time visitors ──

describe("api — first-time visitor (no connection, no dismissal flag) uses MockAdapter", () => {
  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it("getEntries resolves with mock fixture data (no network call)", async () => {
    const { api } = await freshModsFirstVisitor();
    const entries = await api.getEntries();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]).toHaveProperty("id");
    expect(entries[0]).toHaveProperty("direction");
  });
});

// ── Cycle 10: adapter selection is lazy — no reload needed after setConnection ──

describe("api — adapter selection re-evaluates without a module reload", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("switches from MockAdapter to RealAdapter after setConnection, without vi.resetModules", async () => {
    const { setConnection, api } = await freshModsFirstVisitor();

    // First-time visitor: mock fixtures, no network call.
    const entries = await api.getEntries();
    expect(entries.length).toBeGreaterThan(0);

    // Save a Connection at runtime — no reload, no module reset.
    setConnection(FAKE_CONN);
    const fetchMock = vi.fn().mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ entries: [] })),
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.getEntries();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

// ── setAdapter injection ───────────────────────────────────────────────────

describe("api — setAdapter replaces the active adapter", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("gateway delegates to the injected adapter after setAdapter", async () => {
    const { api } = await freshMods();
    const fakeEntry = { id: 99, date: "2026-01-01", tag: "Food", mainCategory: "FOOD", description: "fake", direction: "O" as const, amount: 50 };
    const fake = {
      getEntries: vi.fn().mockResolvedValue([fakeEntry]),
      getMaster: vi.fn().mockResolvedValue({ onHand: 0, budgets: {} }),
      getCategories: vi.fn().mockResolvedValue({}),
      getConfig: vi.fn().mockResolvedValue({ currency: "₱" }),
      addEntry: vi.fn().mockResolvedValue(fakeEntry),
      addEntries: vi.fn().mockResolvedValue([fakeEntry]),
      updateEntry: vi.fn().mockResolvedValue(undefined),
      deleteEntry: vi.fn().mockResolvedValue(undefined),
      validateConnection: vi.fn().mockResolvedValue(undefined),
    };
    api.setAdapter(fake);
    const result = await api.getEntries();
    expect(fake.getEntries).toHaveBeenCalledOnce();
    expect(result).toEqual([fakeEntry]);
  });

  it("validateConnection delegates to the active adapter", async () => {
    const { api } = await freshMods();
    const fake = {
      getEntries: vi.fn().mockResolvedValue([]),
      getMaster: vi.fn().mockResolvedValue({ onHand: 0, budgets: {} }),
      getCategories: vi.fn().mockResolvedValue({}),
      getConfig: vi.fn().mockResolvedValue({ currency: "₱" }),
      addEntry: vi.fn(),
      addEntries: vi.fn(),
      updateEntry: vi.fn(),
      deleteEntry: vi.fn(),
      validateConnection: vi.fn().mockResolvedValue(undefined),
    };
    api.setAdapter(fake);
    await api.validateConnection("https://x.y", "s3cr3t");
    expect(fake.validateConnection).toHaveBeenCalledWith("https://x.y", "s3cr3t");
  });

  it("injected adapter receives calls for mutations", async () => {
    const { api } = await freshMods();
    const fake = {
      getEntries: vi.fn().mockResolvedValue([]),
      getMaster: vi.fn().mockResolvedValue({ onHand: 0, budgets: {} }),
      getCategories: vi.fn().mockResolvedValue({}),
      getConfig: vi.fn().mockResolvedValue({ currency: "₱" }),
      addEntry: vi.fn().mockResolvedValue({ id: 1, date: "2026-01-01", tag: "Food", mainCategory: "FOOD", description: "t", direction: "O" as const, amount: 10 }),
      addEntries: vi.fn().mockResolvedValue([]),
      updateEntry: vi.fn().mockResolvedValue(undefined),
      deleteEntry: vi.fn().mockResolvedValue(undefined),
      validateConnection: vi.fn().mockResolvedValue(undefined),
    };
    api.setAdapter(fake);
    await api.addEntry({ date: "2026-01-01", tag: "Food", description: "t", direction: "O", amount: 10 });
    await api.deleteEntry(1);
    expect(fake.addEntry).toHaveBeenCalledOnce();
    expect(fake.deleteEntry).toHaveBeenCalledWith(1);
  });
});
