import { describe, it, expect, afterEach, vi } from "vitest";
import { RealAdapter, ConnectionError, ConnectionMissingError, UnauthorizedError } from "./adapter-real";

const FAKE_CONN = { gasUrl: "https://fake.gas.example", apiSecret: "test-secret" };

// ── Cycle 1: connection-missing errors ────────────────────────────────────

describe("RealAdapter — connection missing", () => {
  it("getEntries throws ConnectionMissingError", async () => {
    const adapter = new RealAdapter(() => null);
    await expect(adapter.getEntries()).rejects.toBeInstanceOf(ConnectionMissingError);
  });

  it("addEntry throws ConnectionMissingError", async () => {
    const adapter = new RealAdapter(() => null);
    await expect(
      adapter.addEntry({ date: "2026-01-01", tag: "Food", description: "t", direction: "O", amount: 10 })
    ).rejects.toBeInstanceOf(ConnectionMissingError);
  });

  it("ConnectionMissingError is instanceof ConnectionError", async () => {
    const adapter = new RealAdapter(() => null);
    const err = await adapter.getEntries().catch((e) => e);
    expect(err).toBeInstanceOf(ConnectionError);
  });
});

// ── Cycle 2: error classification ─────────────────────────────────────────

describe("RealAdapter — error classification", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("network failure (fetch rejects) throws ConnectionError", async () => {
    const adapter = new RealAdapter(() => FAKE_CONN);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(adapter.getEntries()).rejects.toBeInstanceOf(ConnectionError);
  });

  it("non-JSON response throws ConnectionError", async () => {
    const adapter = new RealAdapter(() => FAKE_CONN);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      text: () => Promise.resolve("<!DOCTYPE html><body>Not Found</body>"),
    }));
    await expect(adapter.getEntries()).rejects.toBeInstanceOf(ConnectionError);
  });

  it("error: unauthorized throws UnauthorizedError", async () => {
    const adapter = new RealAdapter(() => FAKE_CONN);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ error: "unauthorized" })),
    }));
    await expect(adapter.getEntries()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("generic json.error throws plain Error (not ConnectionError)", async () => {
    const adapter = new RealAdapter(() => FAKE_CONN);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ error: "Entry 5 not found" })),
    }));
    const err = await adapter.getEntries().catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(ConnectionError);
    expect(err.message).toBe("Entry 5 not found");
  });
});

// ── Cycle 3: connection values used at call time ───────────────────────────

describe("RealAdapter — uses connection values", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("getEntries uses gasUrl in fetch URL", async () => {
    const adapter = new RealAdapter(() => FAKE_CONN);
    const fetchMock = vi.fn().mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ entries: [] })),
    });
    vi.stubGlobal("fetch", fetchMock);
    await adapter.getEntries();
    expect((fetchMock.mock.calls[0][0] as string).startsWith(FAKE_CONN.gasUrl)).toBe(true);
  });

  it("addEntry includes apiSecret in POST body", async () => {
    const adapter = new RealAdapter(() => FAKE_CONN);
    const entry = { id: 1, date: "2026-01-01", tag: "Food", mainCategory: "FOOD", description: "t", direction: "O" as const, amount: 10 };
    const fetchMock = vi.fn().mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ ok: true, entry })),
    });
    vi.stubGlobal("fetch", fetchMock);
    await adapter.addEntry({ date: "2026-01-01", tag: "Food", description: "t", direction: "O", amount: 10 });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.secret).toBe(FAKE_CONN.apiSecret);
  });

  it("addEntry posts to gasUrl", async () => {
    const adapter = new RealAdapter(() => FAKE_CONN);
    const entry = { id: 1, date: "2026-01-01", tag: "Food", mainCategory: "FOOD", description: "t", direction: "O" as const, amount: 10 };
    const fetchMock = vi.fn().mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ ok: true, entry })),
    });
    vi.stubGlobal("fetch", fetchMock);
    await adapter.addEntry({ date: "2026-01-01", tag: "Food", description: "t", direction: "O", amount: 10 });
    expect(fetchMock.mock.calls[0][0]).toBe(FAKE_CONN.gasUrl);
  });
});

// ── Cycle 4: validateConnection ────────────────────────────────────────────

describe("RealAdapter — validateConnection", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves on 'unknown action' (older GAS deployment)", async () => {
    const adapter = new RealAdapter(() => FAKE_CONN);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ error: "unknown action" })),
    }));
    await expect(
      adapter.validateConnection(FAKE_CONN.gasUrl, FAKE_CONN.apiSecret)
    ).resolves.toBeUndefined();
  });

  it("throws UnauthorizedError when secret is rejected", async () => {
    const adapter = new RealAdapter(() => FAKE_CONN);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ error: "unauthorized" })),
    }));
    await expect(
      adapter.validateConnection(FAKE_CONN.gasUrl, FAKE_CONN.apiSecret)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws ConnectionError on network failure", async () => {
    const adapter = new RealAdapter(() => FAKE_CONN);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    await expect(
      adapter.validateConnection(FAKE_CONN.gasUrl, FAKE_CONN.apiSecret)
    ).rejects.toBeInstanceOf(ConnectionError);
  });
});
