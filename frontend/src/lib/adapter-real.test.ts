import { describe, it, expect, afterEach, vi } from "vitest";
import { RealAdapter, ConnectionError, ConnectionMissingError, UnauthorizedError, isQueueable, isAuthError, userMessage } from "./adapter-real";

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

  it("non-JSON POST response throws ConnectionError (gasPost catch branch)", async () => {
    const adapter = new RealAdapter(() => FAKE_CONN);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      text: () => Promise.resolve("<!DOCTYPE html><body>Gateway Error</body>"),
    }));
    await expect(
      adapter.addEntry({ date: "2026-01-01", tag: "Food", description: "t", direction: "O", amount: 10 })
    ).rejects.toBeInstanceOf(ConnectionError);
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

  it("non-JSON response throws ConnectionError", async () => {
    const adapter = new RealAdapter(() => FAKE_CONN);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      text: () => Promise.resolve("<!DOCTYPE html><body>Gateway Error</body>"),
    }));
    await expect(
      adapter.validateConnection(FAKE_CONN.gasUrl, FAKE_CONN.apiSecret)
    ).rejects.toBeInstanceOf(ConnectionError);
  });
});

// ── Cycle 5: semantic error-classification helpers ─────────────────────────
// These are the interface callers above the adapter seam should use instead
// of `instanceof ConnectionError` / `instanceof UnauthorizedError`.

describe("isQueueable", () => {
  it("is true for ConnectionError", () => {
    expect(isQueueable(new ConnectionError("offline"))).toBe(true);
  });

  it("is true for ConnectionMissingError (a ConnectionError subtype)", () => {
    expect(isQueueable(new ConnectionMissingError("no connection"))).toBe(true);
  });

  it("is true for UnauthorizedError (a ConnectionError subtype)", () => {
    expect(isQueueable(new UnauthorizedError("nope"))).toBe(true);
  });

  it("is false for a plain Error", () => {
    expect(isQueueable(new Error("Entry 5 not found"))).toBe(false);
  });

  it("is false for a non-Error value", () => {
    expect(isQueueable("some string")).toBe(false);
  });
});

describe("isAuthError", () => {
  it("is true for UnauthorizedError", () => {
    expect(isAuthError(new UnauthorizedError("nope"))).toBe(true);
  });

  it("is false for a plain ConnectionError", () => {
    expect(isAuthError(new ConnectionError("offline"))).toBe(false);
  });

  it("is false for a plain Error", () => {
    expect(isAuthError(new Error("oops"))).toBe(false);
  });
});

describe("userMessage", () => {
  it("returns the auth-rejected copy for UnauthorizedError", () => {
    expect(userMessage(new UnauthorizedError("nope"))).toBe(
      "Secret rejected — make sure the secret and the GAS URL are from the same copy of the sheet."
    );
  });

  it("returns the unreachable-URL copy for ConnectionError", () => {
    expect(userMessage(new ConnectionError("offline"))).toBe(
      "Couldn't reach that URL — check the GAS web-app URL and try again."
    );
  });

  it("returns the unreachable-URL copy for ConnectionMissingError", () => {
    expect(userMessage(new ConnectionMissingError("no connection"))).toBe(
      "Couldn't reach that URL — check the GAS web-app URL and try again."
    );
  });

  it("returns a generic fallback for any other error", () => {
    expect(userMessage(new Error("Entry 5 not found"))).toBe(
      "Something went wrong. Check the URL and secret and try again."
    );
  });
});

// ── Cycle 6: adapter owns the request timeout ──────────────────────────────
// The timeout used to live in the store's own `withTimeout` wrapper. It now
// lives here, inside the single module that classifies failures.

describe("RealAdapter — request timeout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("a hung fetch rejects with ConnectionError('Request timed out.') after 15s", async () => {
    vi.useFakeTimers();
    const adapter = new RealAdapter(() => FAKE_CONN);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise(() => {})));
    const pending = adapter.getEntries();
    const assertion = expect(pending).rejects.toBeInstanceOf(ConnectionError);
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    const err = await pending.catch((e) => e);
    expect(err.message).toBe("Request timed out.");
  });

  it("a hung fetch classifies as queueable via isQueueable", async () => {
    vi.useFakeTimers();
    const adapter = new RealAdapter(() => FAKE_CONN);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise(() => {})));
    const pending = adapter.getEntries().catch((e) => e);
    await vi.advanceTimersByTimeAsync(15_000);
    const err = await pending;
    expect(isQueueable(err)).toBe(true);
  });

  it("a fetch that resolves well within 15s does not time out", async () => {
    const adapter = new RealAdapter(() => FAKE_CONN);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      text: () => Promise.resolve(JSON.stringify({ entries: [] })),
    }));
    await expect(adapter.getEntries()).resolves.toEqual([]);
  });
});
