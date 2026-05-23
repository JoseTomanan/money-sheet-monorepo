import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { GasClient } from "../src/client";
import {
  cleanup,
  cleanupByMarker,
  markerDescription,
  pickSubcategories,
  runId,
  trackedAdd,
} from "../src/fixtures";
import type { AddEntryPayload, CategoryMap } from "../src/client";

const client = new GasClient();
const RUN = runId();
let cats: CategoryMap;
let startCount = 0;
const createdIds: number[] = [];

beforeAll(async () => {
  cats = await client.getCategories();
  const entries = await client.getEntries();
  startCount = entries.length;
});

afterEach(async () => {
  await cleanup(client, createdIds);
});

afterAll(async () => {
  // Safety net: race conditions can create rows whose id we never learned
  // (the POST 500'd or returned a duplicate id). Sweep by description marker.
  const swept = await cleanupByMarker(client, RUN);
  if (swept > 0) {
    console.warn(`[tests] safety-net cleanup removed ${swept} orphan row(s)`);
  }
  const entries = await client.getEntries();
  if (entries.length !== startCount) {
    console.warn(
      `[tests] entry count drifted: started=${startCount} ended=${entries.length}. ` +
        `Inspect the sheet for leftover __TEST__${RUN}__ rows.`,
    );
  }
});

describe("split outgoing entry — real GAS API", () => {
  it("each leg in a parallel split receives a distinct entry id", async () => {
    const picks = pickSubcategories(cats, 3);
    const date = new Date().toISOString().slice(0, 10);
    const description = markerDescription(RUN, "unique-ids");
    const payloads: AddEntryPayload[] = picks.map((p, i) => ({
      date,
      tag: p.subcategory,
      description,
      direction: "O",
      amount: 10 + i,
    }));

    const results = await Promise.all(
      payloads.map((p) => trackedAdd(client, p, createdIds)),
    );

    const ids = results.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every leg in a parallel split lands on its own row", async () => {
    const picks = pickSubcategories(cats, 3);
    const date = new Date().toISOString().slice(0, 10);
    const description = markerDescription(RUN, "own-row");
    const payloads: AddEntryPayload[] = picks.map((p, i) => ({
      date,
      tag: p.subcategory,
      description,
      direction: "O",
      amount: 20 + i,
    }));

    const before = await client.getEntries();
    // allSettled — assertion runs even if some POSTs error under concurrency.
    const results = await Promise.allSettled(
      payloads.map((p) => trackedAdd(client, p, createdIds)),
    );
    const after = await client.getEntries();

    // Every leg must show up as its own row on the sheet — regardless of
    // whether some POSTs returned an error to the client.
    const ourRows = after.filter((e) => e.description === description);
    expect(ourRows).toHaveLength(payloads.length);

    // Net count must increase by exactly the number of legs — no overwrites.
    expect(after.length - before.length).toBe(payloads.length);

    // Sanity: log how many requests the client thought succeeded, for diagnostics.
    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    if (fulfilled !== payloads.length) {
      console.warn(
        `[tests] only ${fulfilled}/${payloads.length} addEntry calls returned successfully`,
      );
    }
  });

  // Sequential — isolates "is each leg's content correctly encoded" from
  // the concurrency races covered above. The real frontend submits in
  // parallel; once the race is fixed, parallel will produce the same result.
  it("legs share date/description/direction; tag and amount are per-leg", async () => {
    const picks = pickSubcategories(cats, 2);
    const date = new Date().toISOString().slice(0, 10);
    const description = markerDescription(RUN, "correctness");
    const direction = "O" as const;
    const payloads: AddEntryPayload[] = picks.map((p, i) => ({
      date,
      tag: p.subcategory,
      description,
      direction,
      amount: 100 + i * 10,
    }));

    const created: number[] = [];
    for (const p of payloads) {
      const entry = await trackedAdd(client, p, createdIds);
      created.push(entry.id);
    }

    const after = await client.getEntries();
    const ourRows = after.filter((e) => created.includes(e.id));
    expect(ourRows).toHaveLength(payloads.length);

    for (const payload of payloads) {
      const match = ourRows.find(
        (r) => r.tag === payload.tag && r.amount === payload.amount,
      );
      expect(
        match,
        `no row matches tag=${payload.tag} amount=${payload.amount}`,
      ).toBeDefined();
      expect(match!.date).toBe(payload.date);
      expect(match!.description).toBe(payload.description);
      expect(match!.direction).toBe(payload.direction);
      // mainCategory is formula-driven (VLOOKUP). It must resolve to the
      // category that owns this subcategory, not be empty.
      const expectedCategory = picks.find(
        (pk) => pk.subcategory === payload.tag,
      )!.category;
      expect(match!.mainCategory).toBe(expectedCategory);
    }
  });

  // Partial failure: today the frontend's store calls Promise.all([...adds]).
  // Promise.all rejects on the first failure, but GAS has no transaction,
  // so any leg that already succeeded stays on the sheet — the user is left
  // with a half-applied split. This test documents that behavior: a known
  // "unhappy path" the UI should eventually surface (rollback, retry, or
  // at least a toast saying "2 of 3 legs saved").
  it("partial failure: surviving legs persist when one leg's POST errors", async () => {
    const picks = pickSubcategories(cats, 2);
    const date = new Date().toISOString().slice(0, 10);
    const description = markerDescription(RUN, "partial-fail");

    const goodA = trackedAdd(
      client,
      {
        date,
        tag: picks[0].subcategory,
        description,
        direction: "O",
        amount: 200,
      },
      createdIds,
    );
    // Mimic a leg whose POST is rejected by GAS (missing secret → "unauthorized").
    const bad = new GasClient(process.env.GAS_URL!, "wrong-secret-on-purpose")
      .addEntry({
        date,
        tag: picks[1].subcategory,
        description,
        direction: "O",
        amount: 999,
      });
    const goodB = trackedAdd(
      client,
      {
        date,
        tag: picks[1].subcategory,
        description,
        direction: "O",
        amount: 300,
      },
      createdIds,
    );

    const results = await Promise.allSettled([goodA, bad, goodB]);

    expect(results[0].status).toBe("fulfilled");
    expect(results[1].status).toBe("rejected");
    expect(results[2].status).toBe("fulfilled");

    // Survivors must be on the sheet — no rollback today.
    const after = await client.getEntries();
    const survivors = after.filter((e) => e.description === description);
    expect(survivors).toHaveLength(2);

    // And the failed leg must NOT be on the sheet.
    const ghosts = after.filter(
      (e) => e.description === description && e.amount === 999,
    );
    expect(ghosts).toHaveLength(0);
  });
});
