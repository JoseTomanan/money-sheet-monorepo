import { describe, it, expect, vi } from "vitest";
import { MockAdapter } from "./adapter-mock";
import type { GatewayAdapter } from "./types";

// ── Cycle 5: MockAdapter satisfies GatewayAdapter ─────────────────────────

describe("MockAdapter — satisfies GatewayAdapter interface", () => {
  it("is assignable to GatewayAdapter at runtime", () => {
    const adapter: GatewayAdapter = new MockAdapter();
    expect(adapter).toBeTruthy();
  });
});

// ── Cycle 6: getEntries returns data without network ──────────────────────

describe("MockAdapter — getEntries", () => {
  it("returns a non-empty entry list without calling fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const adapter = new MockAdapter();
    const entries = await adapter.getEntries();
    expect(entries.length).toBeGreaterThan(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("entries have expected shape", async () => {
    const adapter = new MockAdapter();
    const entries = await adapter.getEntries();
    const e = entries[0];
    expect(e).toMatchObject({
      id: expect.any(Number),
      date: expect.any(String),
      tag: expect.any(String),
      mainCategory: expect.any(String),
      direction: expect.stringMatching(/^[IO]$/),
      amount: expect.any(Number),
    });
  });
});

// ── Cycle 7: addEntry persists to in-memory store ─────────────────────────

describe("MockAdapter — addEntry", () => {
  it("returns a new entry with an assigned id", async () => {
    const adapter = new MockAdapter();
    const entry = await adapter.addEntry({
      date: "2026-01-01",
      tag: "Groceries",
      description: "test item",
      direction: "O",
      amount: 50,
    });
    expect(entry.id).toBeGreaterThan(0);
    expect(entry.date).toBe("2026-01-01");
    expect(entry.amount).toBe(50);
  });

  it("rejects canonical validation failures", async () => {
    const adapter = new MockAdapter();
    await expect(adapter.addEntry({
      date: "2026-99-99",
      tag: "Groceries",
      description: "bad date",
      direction: "O",
      amount: 50,
    }, "mock-invalid-date")).rejects.toThrow('"date" must be a valid ISO date string');
    await expect(adapter.addEntry({
      date: "2026-01-01",
      tag: "Groceries",
      description: "bad tag-direction pair",
      direction: "I",
      amount: 50,
    }, "mock-invalid-tag")).rejects.toThrow('Incoming entries require a Category tag');
  });

  it("replays identical Mutation IDs without duplicating rows and rejects mismatches", async () => {
    const adapter = new MockAdapter();
    const payload = { date: "2026-01-01", tag: "Groceries", description: "idempotent mock", direction: "O" as const, amount: 50 };
    const first = await adapter.addEntry(payload, "mock-idempotent-single");
    const replay = await adapter.addEntry(payload, "mock-idempotent-single");
    expect(replay).toEqual(first);
    await expect(adapter.addEntry({ ...payload, amount: 51 }, "mock-idempotent-single"))
      .rejects.toThrow("Mutation ID was already used with different entry content");
  });

  it("keeps batch Mutation IDs idempotent in original request order", async () => {
    const adapter = new MockAdapter();
    const payloads = [
      { date: "2026-01-02", tag: "Groceries", description: "batch main", direction: "O" as const, amount: 20 },
      { date: "2026-01-02", tag: "Dining", description: "^^", direction: "O" as const, amount: 30 },
    ];
    const first = await adapter.addEntries(payloads, "mock-idempotent-batch");
    const replay = await adapter.addEntries(payloads, "mock-idempotent-batch");
    expect(replay).toEqual(first);
    await expect(adapter.addEntries([{ ...payloads[0], amount: 21 }, payloads[1]], "mock-idempotent-batch"))
      .rejects.toThrow("Mutation ID was already used with different entry content");
  });

  it("uses date-ordered rows for adds and date-changing updates", async () => {
    const adapter = new MockAdapter();
    const before = await adapter.getEntries();
    const firstExistingId = before[0].id;
    const added = await adapter.addEntry({
      date: "2000-01-01",
      tag: "Groceries",
      description: "backdated mock entry",
      direction: "O",
      amount: 50,
    }, "mock-backdated");
    expect(added.row).toBe(2);
    expect((await adapter.getEntries()).find((entry) => entry.id === firstExistingId)?.row).toBe(3);

    await adapter.updateEntry(added.id, { date: "2999-12-31" });
    const moved = (await adapter.getEntries()).find((entry) => entry.id === added.id)!;
    expect(moved.id).toBe(added.id);
    expect(moved.row).toBe(Math.max(...(await adapter.getEntries()).map((entry) => entry.row ?? 0)));
  });
});

// ── Cycle 8: validateConnection is a no-op ────────────────────────────────

describe("MockAdapter — validateConnection", () => {
  it("resolves without throwing regardless of inputs", async () => {
    const adapter = new MockAdapter();
    await expect(
      adapter.validateConnection("https://any.url", "any-secret")
    ).resolves.toBeUndefined();
  });
});

// ── Cycle N: updateEntry and deleteEntry ──────────────────────────────────

describe("MockAdapter — updateEntry", () => {
  it("resolves to undefined for an existing entry", async () => {
    const adapter = new MockAdapter();
    const entries = await adapter.getEntries();
    await expect(adapter.updateEntry(entries[0].id, { description: "updated" })).resolves.toBeUndefined();
  });

  it("rejects an unknown Entry ID with canonical not-found behavior", async () => {
    const adapter = new MockAdapter();
    await expect(adapter.updateEntry(999_999, { description: "missing" }))
      .rejects.toThrow("Entry with id 999999 not found");
  });
});

describe("MockAdapter — deleteEntry", () => {
  it("resolves to undefined for an existing entry", async () => {
    const adapter = new MockAdapter();
    const entries = await adapter.getEntries();
    await expect(adapter.deleteEntry(entries[0].id)).resolves.toBeUndefined();
  });

  it("rejects an unknown Entry ID with canonical not-found behavior", async () => {
    const adapter = new MockAdapter();
    await expect(adapter.deleteEntry(999_999)).rejects.toThrow("Entry with id 999999 not found");
  });
});

// ── Additional: getCategories, getMaster, getConfig ───────────────────────

describe("MockAdapter — read methods return expected shapes", () => {
  it("getCategories returns a non-empty CategoryMap", async () => {
    const adapter = new MockAdapter();
    const categories = await adapter.getCategories();
    expect(Object.keys(categories).length).toBeGreaterThan(0);
  });

  it("getMaster returns onHand (number) and budgets (object)", async () => {
    const adapter = new MockAdapter();
    const master = await adapter.getMaster();
    expect(typeof master.onHand).toBe("number");
    expect(typeof master.budgets).toBe("object");
  });

  it("getConfig returns config with currency string", async () => {
    const adapter = new MockAdapter();
    const config = await adapter.getConfig();
    expect(typeof config.currency).toBe("string");
  });

  it("getStats returns categoryMonthChange and spendingPace arrays", async () => {
    const adapter = new MockAdapter();
    const stats = await adapter.getStats();
    expect(Array.isArray(stats.categoryMonthChange)).toBe(true);
    expect(stats.categoryMonthChange.length).toBeGreaterThan(0);
    expect(Array.isArray(stats.spendingPace)).toBe(true);
    expect(stats.spendingPace.length).toBeGreaterThan(0);
    for (const row of stats.categoryMonthChange) {
      expect(typeof row.category).toBe("string");
      expect(typeof row.incoming).toBe("number");
      expect(typeof row.outgoing).toBe("number");
      expect(row.netChange).toBeCloseTo(row.incoming - row.outgoing);
    }
    for (const row of stats.spendingPace) {
      expect(typeof row.day).toBe("number");
      expect(typeof row.cumulativeThisMonth).toBe("number");
      expect(typeof row.cumulativeUsual).toBe("number");
    }
  });
});
