import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { GasClient } from "../src/client";
import {
  cleanup,
  cleanupByMarker,
  markerDescription,
  pickSubcategories,
  runId,
  trackedAdd,
  trackedAddBatch,
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

  // addEntries (issue #111): a Split Entry / Fund Redistribution's legs are now
  // submitted as one atomic batch under a single document lock. These tests
  // supersede the old "partial failure: surviving legs persist" characterization —
  // that orphaning behavior is no longer possible: a batch either writes every
  // leg or writes none.
  describe("addEntries — atomic batch", () => {
    it("rejects the whole batch when one leg is invalid, writing zero rows", async () => {
      const picks = pickSubcategories(cats, 1);
      const date = new Date().toISOString().slice(0, 10);
      const description = markerDescription(RUN, "atomic-reject");
      const invalidCategoryTag = Object.keys(cats)[0]; // Category name — invalid as an Outgoing tag

      const before = await client.getEntries();

      await expect(
        client.addEntries([
          { date, tag: picks[0].subcategory, description, direction: "O", amount: 50 },
          { date, tag: invalidCategoryTag, description, direction: "O", amount: 60 },
        ]),
      ).rejects.toThrow();

      const after = await client.getEntries();
      expect(after.length).toBe(before.length);
      expect(after.filter((e) => e.description === description)).toHaveLength(0);
    });

    it("valid N-leg batch inserts exactly N rows under one lock, with contiguous array-order ids", async () => {
      const picks = pickSubcategories(cats, 3);
      const date = new Date().toISOString().slice(0, 10);
      const description = markerDescription(RUN, "atomic-success");

      const before = await client.getEntries();
      const payloads: AddEntryPayload[] = [
        { date, tag: picks[0].subcategory, description, direction: "O", amount: 40 },
        { date, tag: picks[1].subcategory, description: "^^", direction: "O", amount: 50 },
        { date, tag: picks[2].subcategory, description: "^^", direction: "O", amount: 60 },
      ];

      const entries = await trackedAddBatch(client, payloads, createdIds);
      const after = await client.getEntries();

      expect(after.length - before.length).toBe(payloads.length);
      expect(entries).toHaveLength(payloads.length);

      // Distinct, contiguous, and assigned in array order (leg 0 = lowest —
      // the main leg owns the lowest id in the run, preserving `^^` grouping).
      const ids = entries.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
      const sorted = [...ids].sort((a, b) => a - b);
      expect(ids).toEqual(sorted);
      for (let i = 1; i < ids.length; i++) expect(ids[i]).toBe(ids[i - 1] + 1);

      // Descriptions stored verbatim; each leg's mainCategory resolves correctly.
      for (let i = 0; i < entries.length; i++) {
        expect(entries[i].description).toBe(payloads[i].description);
        expect(entries[i].tag).toBe(payloads[i].tag);
        expect(entries[i].amount).toBe(payloads[i].amount);
        expect(entries[i].mainCategory).toBe(picks[i].category);
      }
    });

    it("concurrency: a batch racing a single add never collides on ids or overwrites rows", async () => {
      const picks = pickSubcategories(cats, 3);
      const date = new Date().toISOString().slice(0, 10);
      const batchDescription = markerDescription(RUN, "atomic-concurrency-batch");
      const soloDescription = markerDescription(RUN, "atomic-concurrency-solo");

      const before = await client.getEntries();

      const batchPayloads: AddEntryPayload[] = [
        { date, tag: picks[0].subcategory, description: batchDescription, direction: "O", amount: 70 },
        { date, tag: picks[1].subcategory, description: "^^", direction: "O", amount: 80 },
      ];
      const soloPayload: AddEntryPayload = {
        date,
        tag: picks[2].subcategory,
        description: soloDescription,
        direction: "O",
        amount: 90,
      };

      const [batchEntries, soloEntry] = await Promise.all([
        trackedAddBatch(client, batchPayloads, createdIds),
        trackedAdd(client, soloPayload, createdIds),
      ]);

      const after = await client.getEntries();
      expect(after.length - before.length).toBe(3);

      const allIds = [...batchEntries.map((e) => e.id), soloEntry.id];
      expect(new Set(allIds).size).toBe(allIds.length);

      const ourRows = after.filter((e) => allIds.includes(e.id));
      expect(ourRows).toHaveLength(3);
    });
  });
});
