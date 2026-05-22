/**
 * Real-API integration test: store mutation methods leave `store.entries`
 * in sync with a fresh `api.getEntries()` call. Catches drift bugs where
 * the store's optimistic state or its fire-and-forget `refreshAll(true)`
 * diverges from what GAS actually persisted.
 *
 * Closes #26.
 *
 * Skips when VITE_GAS_URL is missing — safe to leave in repo.
 * Requires VITE_MOCK !== "true" so api.ts hits the live endpoint.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { store } from "./store.svelte";
import * as api from "./api";
import type { AddEntryPayload, Entry } from "./types";

const HAS_ENV =
  Boolean(import.meta.env.VITE_GAS_URL) &&
  import.meta.env.VITE_MOCK !== "true";

const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
const createdIds: number[] = [];

function marker(label: string): string {
  return `__TEST__${RUN}__${label}`;
}

function flatSubcats(): Array<{ category: string; subcategory: string }> {
  const out: Array<{ category: string; subcategory: string }> = [];
  for (const [category, subs] of Object.entries(store.categories)) {
    for (const subcategory of subs) out.push({ category, subcategory });
  }
  return out;
}

function pickSubcategories(n: number): Array<{ category: string; subcategory: string }> {
  const flat = flatSubcats();
  if (flat.length < n) {
    throw new Error(`Need ${n} subcategories, sheet has ${flat.length}`);
  }
  return flat.slice(0, n);
}

async function waitForSettle(): Promise<void> {
  await vi.waitFor(
    () => {
      if (store.masterLoading) throw new Error("still loading");
    },
    { timeout: 20_000, interval: 150 },
  );
  // The store's in-flight refreshAll(true) is fire-and-forget; give it a beat
  // to land before we issue our own explicit refresh.
  await new Promise((r) => setTimeout(r, 250));
  await store.refreshAll(true);
}

function diffNewIds(before: Entry[], after: Entry[]): number[] {
  const beforeIds = new Set(before.map((e) => e.id));
  return after.filter((e) => !beforeIds.has(e.id)).map((e) => e.id);
}

describe.skipIf(!HAS_ENV)("store ↔ GAS up-to-dateness", () => {
  beforeAll(async () => {
    await store.refreshAll(false);
  }, 30_000);

  afterEach(async () => {
    for (const id of createdIds.splice(0)) {
      try {
        await api.deleteEntry(id);
      } catch {
        // best-effort
      }
    }
  }, 30_000);

  afterAll(async () => {
    // Safety net: sweep any row whose description carries our run marker.
    const entries = await api.getEntries();
    const prefix = `__TEST__${RUN}__`;
    const orphans = entries.filter((e) => e.description.startsWith(prefix));
    for (const e of orphans) {
      try {
        await api.deleteEntry(e.id);
      } catch {
        // best-effort
      }
    }
    if (orphans.length > 0) {
      console.warn(
        `[store-sync] swept ${orphans.length} orphan row(s) — investigate the sheet for leftover ${prefix} entries`,
      );
    }
  }, 30_000);

  it("store.addEntry (single): store.entries equals fresh GAS read after settle", { timeout: 30_000 }, async () => {
    const [{ subcategory }] = pickSubcategories(1);
    const payload: AddEntryPayload = {
      date: new Date().toISOString().slice(0, 10),
      tag: subcategory,
      description: marker("single-add"),
      direction: "O",
      amount: 50,
    };

    const before = [...store.entries];

    store.addEntry(payload);
    await waitForSettle();

    const fresh = await api.getEntries();
    const newIds = diffNewIds(before, fresh);
    createdIds.push(...newIds);

    expect(newIds).toHaveLength(1);
    expect(store.entries).toEqual(fresh);
    expect(store.entries.some((e) => e.description === payload.description)).toBe(true);
  });

  it("store.addEntry (split / array): store.entries equals fresh GAS read after settle", { timeout: 45_000 }, async () => {
    const picks = pickSubcategories(3);
    const date = new Date().toISOString().slice(0, 10);
    const description = marker("split-add");
    const payloads: AddEntryPayload[] = picks.map((p, i) => ({
      date,
      tag: p.subcategory,
      description,
      direction: "O",
      amount: 60 + i,
    }));

    const before = [...store.entries];

    store.addEntry(payloads);
    await waitForSettle();

    const fresh = await api.getEntries();
    const newIds = diffNewIds(before, fresh);
    createdIds.push(...newIds);

    // Each leg should be its own row on the sheet — the GAS-side race in
    // splitEntry.real.test.ts may make this less than `payloads.length`.
    // If so, that's the documented split-entry bug, not a store-sync bug.
    const ourRows = fresh.filter((e) => e.description === description);
    expect(ourRows.length).toBeGreaterThanOrEqual(1);

    expect(store.entries).toEqual(fresh);
  });

  it("store.deleteEntry: store.entries equals fresh GAS read after settle", { timeout: 30_000 }, async () => {
    const [{ subcategory }] = pickSubcategories(1);
    // Seed an entry directly via api, then refresh the store so it sees it.
    const seeded = await api.addEntry({
      date: new Date().toISOString().slice(0, 10),
      tag: subcategory,
      description: marker("delete-target"),
      direction: "O",
      amount: 70,
    });
    await store.refreshAll(true);
    expect(store.entries.some((e) => e.id === seeded.id)).toBe(true);

    store.deleteEntry(seeded.id);
    await waitForSettle();

    const fresh = await api.getEntries();
    expect(fresh.some((e) => e.id === seeded.id)).toBe(false);
    expect(store.entries).toEqual(fresh);
  });

  it("store.updateEntry: store.entries equals fresh GAS read after settle", { timeout: 30_000 }, async () => {
    const [{ subcategory }] = pickSubcategories(1);
    const seeded = await api.addEntry({
      date: new Date().toISOString().slice(0, 10),
      tag: subcategory,
      description: marker("update-target"),
      direction: "O",
      amount: 80,
    });
    createdIds.push(seeded.id);
    await store.refreshAll(true);

    const newDescription = marker("update-after");
    store.updateEntry(seeded.id, { amount: 999, description: newDescription });
    await waitForSettle();

    const fresh = await api.getEntries();
    const updated = fresh.find((e) => e.id === seeded.id);
    expect(updated).toBeDefined();
    expect(updated!.amount).toBe(999);
    expect(updated!.description).toBe(newDescription);
    expect(store.entries).toEqual(fresh);
  });
});
