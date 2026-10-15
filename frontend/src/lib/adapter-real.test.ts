import { describe, it, expect, afterEach, vi } from "vitest";
import { RealAdapter, ConnectionError, ConnectionMissingError, UnauthorizedError, isQueueable, isAuthError, userMessage } from "./adapter-real";

const FAKE_CONN = { gasUrl: "https://fake.gas.example", apiSecret: "test-secret" };
const PAYLOAD = { date: '2026-01-01', tag: 'Groceries', description: 'lunch', direction: 'O' as const, amount: 10 };
const ENTRY = { ...PAYLOAD, id: 1, mainCategory: 'FOOD' };

describe('RealAdapter add evidence', () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    { ok: true }, { ok: true, entry: null }, { ok: true, entry: {} },
    { ok: true, entry: { ...ENTRY, id: -1 } },
    { ok: true, entry: { ...ENTRY, amount: '10' } },
    { ok: true, entry: { ...ENTRY, date: '2026-02-30' } },
    { ok: true, entry: { ...ENTRY, description: 'another save' } },
  ])('does not acknowledge an unusable or unrelated Entry: %j', async reply => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: async () => JSON.stringify(reply) }));
    const error = await new RealAdapter(() => FAKE_CONN).addEntry(PAYLOAD, 'original-key').catch(error => error);
    expect(isQueueable(error)).toBe(true);
  });
  it.each([undefined, [], [ENTRY], [ENTRY, ENTRY],
    [{ ...ENTRY, id: 2, description: '^^' }, ENTRY],
    [ENTRY, { ...ENTRY, id: 0, description: '^^' }],
  ].map(entries => ({ entries })))('does not acknowledge an incomplete or unordered batch: %j', async ({ entries }) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: async () => JSON.stringify({ ok: true, entries }) }));
    const error = await new RealAdapter(() => FAKE_CONN)
      .addEntries([PAYLOAD, { ...PAYLOAD, description: '^^' }], 'batch-key').catch(error => error);
    expect(isQueueable(error)).toBe(true);
  });
});

describe('RealAdapter read evidence', () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    ['getEntries', { entries: [ENTRY, null] }],
    ['getEntries', { entries: [{ ...ENTRY, direction: 'X' }] }],
    ['getMaster', { master: { onHand: '100', budgets: {} } }],
    ['getMaster', { master: { onHand: 100, budgets: { FOOD: null } } }],
    ['getCategories', { categories: { FOOD: [123] } }],
    ['getConfig', { config: { currency: 123 } }],
    ['getStats', { stats: {} }],
    ['getStats', { stats: { categoryMonthChange: [], spendingPace: [{ day: 1 }], windowTotals: [], windowCategorySpend: [] } }],
  ] as const)('rejects malformed %s data', async (action, reply) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: async () => JSON.stringify(reply) }));
    const error = await new RealAdapter(() => FAKE_CONN)[action]().catch(error => error);
    expect(isQueueable(error)).toBe(true);
  });
  it.each(['getEntries', 'getMaster', 'getCategories', 'getConfig', 'getStats'] as const)(
    '%s rejects missing action data', async action => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: async () => '{"ok":true}' }));
      const error = await new RealAdapter(() => FAKE_CONN)[action]().catch(error => error);
      expect(isQueueable(error)).toBe(true);
    });
});

describe('RealAdapter supported success replies', () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([true, false])('accepts shaped reads with canonical envelope: %s', async canonical => {
    const stats = { categoryMonthChange: [{ category: 'FOOD', incoming: 10, outgoing: 2, netChange: 8 }],
      spendingPace: [{ day: 1, cumulativeThisMonth: 2, cumulativeUsual: 3 }],
      windowTotals: [{ window: '30d', incoming: 10, outgoing: 2, net: 8 }],
      windowCategorySpend: [{ window: '30d', category: 'FOOD', outgoing: 2 }] };
    const replies = {
      getEntries: { entries: [{ ...ENTRY, date: '1/1/2026' }] },
      getMaster: { master: { onHand: 8, budgets: { FOOD: 8 } } },
      getCategories: { categories: { FOOD: ['Groceries'] } }, getConfig: { config: {} }, getStats: { stats },
    };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ text: async () => JSON.stringify({
      ...(canonical ? { ok: true } : {}), ...replies[new URL(url).searchParams.get('action') as keyof typeof replies],
    }) })));
    const adapter = new RealAdapter(() => FAKE_CONN);
    expect(await adapter.getEntries()).toEqual([ENTRY]);
    expect(await adapter.getMaster()).toEqual(replies.getMaster.master);
    expect(await adapter.getCategories()).toEqual(replies.getCategories.categories);
    expect(await adapter.getConfig()).toEqual({ currency: '₱' });
    expect(await adapter.getStats()).toEqual(stats);
  });
  it.each([true, false])('accepts confirmed mutations and preserves text/plain transport (canonical adds: %s)', async canonical => {
    const entries = [ENTRY, { ...ENTRY, id: 2, description: '^^' }];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      return { text: async () => JSON.stringify({
        ...(canonical || !['addEntry', 'addEntries'].includes(body.action) ? { ok: true } : {}),
        ...(body.action === 'addEntry' ? { entry: ENTRY } : body.action === 'addEntries' ? { entries } : {}),
      }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new RealAdapter(() => FAKE_CONN);
    expect(await adapter.addEntry(PAYLOAD, 'single-key')).toEqual(ENTRY);
    expect(await adapter.addEntries([PAYLOAD, { ...PAYLOAD, description: '^^' }], 'batch-key')).toEqual(entries);
    await expect(adapter.updateEntry(1, { amount: 2 })).resolves.toBeUndefined();
    await expect(adapter.deleteEntry(1)).resolves.toBeUndefined();
    await expect(adapter.validateConnection(FAKE_CONN.gasUrl, FAKE_CONN.apiSecret)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls.every(([, init]) =>
      (init.headers as Record<string, string>)['Content-Type'] === 'text/plain')).toBe(true);
  });
});

describe('RealAdapter acknowledgment evidence', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([{}, null, [], { ok: false }, { ok: true, error: 'failed' },
    { ok: false, code: 'validation', message: 'invalid', entry: ENTRY },
    { ok: true, entry: ENTRY }, { ok: true, entries: [] },
  ])(
    'retains ambiguity for a malformed acknowledgment: %j', async reply => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: async () => JSON.stringify(reply) }));
      const adapter = new RealAdapter(() => FAKE_CONN);
      for (const request of [() => adapter.updateEntry(1, { amount: 2 }), () => adapter.deleteEntry(1),
        () => adapter.validateConnection(FAKE_CONN.gasUrl, FAKE_CONN.apiSecret)]) {
        const error = await request().then(() => null, error => error);
        expect(isQueueable(error)).toBe(true);
      }
    },
  );
});

describe('RealAdapter rejection semantics', () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    [{ ok: false, code: 'auth', message: 'denied' }, true, true],
    [{ ok: false, code: 'validation', message: 'invalid tag' }, false, false],
    [{ ok: false, code: 'not_found', message: 'gone' }, false, false],
    [{ ok: false, code: 'internal', message: 'write may have committed' }, true, false],
    [{ error: 'write failed unexpectedly' }, true, false],
    [{ error: 'Incoming entries failed during writing' }, true, false],
    [{ error: 'Entry with id 1 not found' }, false, false],
    [{ error: 'Entry not found' }, false, false],
    [{ ok: false, code: 'future_code', message: 'unknown' }, true, false],
    [{ ok: false, code: 'validation', message: 12 }, true, false],
    [{ code: 'not_found', message: 'gone' }, true, false],
    [{ ok: false, code: 'validation', message: 'invalid', error: 'different outcome' }, true, false],
    [{ error: 'Tag "gone" is not a Category. Incoming entries require a Category tag (e.g. FOOD, HOUSING).' }, false, false],
    [{ error: '"amount" must be a finite number, got: null' }, false, false],
  ])('classifies rejection %j', async (reply, queueable, auth) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ text: async () => JSON.stringify(reply) }));
    const error = await new RealAdapter(() => FAKE_CONN).deleteEntry(1).catch(error => error);
    expect(error).toBeInstanceOf(Error);
    expect(isQueueable(error)).toBe(queueable);
    expect(isAuthError(error)).toBe(auth);
  });
  it('does not acknowledge success carried by a failed HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, text: async () => '{"ok":true}' })));
    const error = await new RealAdapter(() => FAKE_CONN).deleteEntry(1).catch(error => error);
    expect(isQueueable(error)).toBe(true);
  });
});

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
