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
});

describe("MockAdapter — deleteEntry", () => {
  it("resolves to undefined for an existing entry", async () => {
    const adapter = new MockAdapter();
    const entries = await adapter.getEntries();
    await expect(adapter.deleteEntry(entries[0].id)).resolves.toBeUndefined();
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
});
