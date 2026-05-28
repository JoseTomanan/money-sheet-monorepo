import { describe, it, expect, afterEach, vi } from "vitest";
import type { AddEntryPayload } from "./types";

const FAKE_GAS_URL = "https://fake.gas.example";
const FAKE_SECRET = "test-api-secret";
const FAKE_CONN = { gasUrl: FAKE_GAS_URL, apiSecret: FAKE_SECRET };

async function freshMods(preSet?: () => void) {
  localStorage.clear();
  if (preSet) preSet();
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
