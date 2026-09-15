import { describe, expect, it } from "vitest";
import {
  createEntryApplication,
  type EntryRepository,
} from "./entries";
import type { Entry } from "../domain/entry";

function entry(id: number, mutationId: string): Entry & { mutationId: string } {
  return {
    id,
    mutationId,
    date: "2026-09-15",
    tag: "FOOD",
    mainCategory: "FOOD",
    description: "Lunch",
    direction: "I",
    amount: 100,
    row: id + 1,
  };
}

describe("Entry application", () => {
  it("returns the original Entry when an identical Mutation ID is retried", () => {
    const existing = entry(7, "retry-1");
    let inserted = false;
    const repository: EntryRepository = {
      list: () => [existing],
      findByMutationId: () => [existing],
      insert: () => { inserted = true; return existing; },
      insertMany: () => { throw new Error("not used"); },
      update: () => { throw new Error("not used"); },
      remove: () => { throw new Error("not used"); },
    };
    const app = createEntryApplication({
      repository,
      transact: (work) => work(repository),
    });

    expect(app.add({
      mutationId: "retry-1",
      date: existing.date,
      tag: existing.tag,
      description: existing.description,
      direction: existing.direction,
      amount: existing.amount,
    })).toEqual({ status: "duplicate", entry: existing });
    expect(inserted).toBe(false);
  });

  it("returns an idempotent batch in Entry ID order", () => {
    const second = entry(9, "retry-batch");
    const first = { ...entry(8, "retry-batch"), description: "Breakfast" };
    const repository: EntryRepository = {
      list: () => [],
      findByMutationId: () => [second, first],
      insert: () => { throw new Error("not used"); },
      insertMany: () => { throw new Error("not used"); },
      update: () => { throw new Error("not used"); },
      remove: () => { throw new Error("not used"); },
    };
    const app = createEntryApplication({ repository, transact: (work) => work(repository) });

    expect(app.addMany({
      mutationId: "retry-batch",
      entries: [
        { date: first.date, tag: first.tag, description: first.description, direction: first.direction, amount: first.amount },
        { date: second.date, tag: second.tag, description: second.description, direction: second.direction, amount: second.amount },
      ],
    })).toEqual({ status: "duplicate", entries: [first, second] });
  });

  it("describes a missing delete as an application outcome", () => {
    const repository: EntryRepository = {
      list: () => [],
      findByMutationId: () => [],
      insert: () => { throw new Error("not used"); },
      insertMany: () => { throw new Error("not used"); },
      update: () => false,
      remove: () => false,
    };
    const app = createEntryApplication({ repository, transact: (work) => work(repository) });

    expect(app.remove(404)).toEqual({ status: "not_found", id: 404 });
  });

  it("rejects a reused Mutation ID with different Entry content", () => {
    const existing = entry(7, "conflict-1");
    const repository: EntryRepository = {
      list: () => [existing],
      findByMutationId: () => [existing],
      insert: () => { throw new Error("not used"); },
      insertMany: () => { throw new Error("not used"); },
      update: () => true,
      remove: () => true,
    };
    const app = createEntryApplication({ repository, transact: (work) => work(repository) });

    expect(app.add({
      mutationId: "conflict-1",
      date: existing.date,
      tag: existing.tag,
      description: "Different content",
      direction: existing.direction,
      amount: existing.amount,
    })).toEqual({ status: "mismatch" });
  });
});
