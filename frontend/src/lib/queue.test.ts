import { describe, it, expect, beforeEach } from "vitest";
import { readQueue, writeQueue, enqueue, clearQueue } from "./queue";
import type { QueueItem } from "./queue";

const ADD_A: QueueItem = {
  op: "add",
  tempId: -1001,
  payload: { date: "2026-01-01", tag: "Groceries", description: "buy stuff", direction: "O", amount: 50 },
};

const EDIT_A: QueueItem = {
  op: "edit",
  id: -1001,
  patch: { amount: 75 },
};

const DELETE_A: QueueItem = {
  op: "delete",
  id: -1001,
};

const EDIT_REAL: QueueItem = {
  op: "edit",
  id: 42,
  patch: { description: "first edit" },
};

const EDIT_REAL2: QueueItem = {
  op: "edit",
  id: 42,
  patch: { description: "second edit", amount: 100 },
};

const DELETE_REAL: QueueItem = {
  op: "delete",
  id: 42,
};

describe("queue", () => {
  beforeEach(() => localStorage.clear());

  it("readQueue returns [] when localStorage is empty", () => {
    expect(readQueue()).toEqual([]);
  });

  it("writeQueue + readQueue round-trips the queue", () => {
    writeQueue([ADD_A]);
    expect(readQueue()).toEqual([ADD_A]);
  });

  it("enqueue add: appends a new add item", () => {
    enqueue(ADD_A);
    expect(readQueue()).toEqual([ADD_A]);
  });

  it("enqueue add + edit(same tempId): merges into single add with updated payload", () => {
    enqueue(ADD_A);
    enqueue(EDIT_A);
    const q = readQueue();
    expect(q).toHaveLength(1);
    expect(q[0].op).toBe("add");
    if (q[0].op === "add") {
      expect(q[0].tempId).toBe(-1001);
      expect(q[0].payload.amount).toBe(75);
      expect(q[0].payload.date).toBe("2026-01-01");
    }
  });

  it("enqueue add + delete(same tempId): net zero — queue is empty", () => {
    enqueue(ADD_A);
    enqueue(DELETE_A);
    expect(readQueue()).toEqual([]);
  });

  it("enqueue edit + edit(same id): merges patches, keeping latest values", () => {
    enqueue(EDIT_REAL);
    enqueue(EDIT_REAL2);
    const q = readQueue();
    expect(q).toHaveLength(1);
    expect(q[0].op).toBe("edit");
    if (q[0].op === "edit") {
      expect(q[0].id).toBe(42);
      expect(q[0].patch.description).toBe("second edit");
      expect(q[0].patch.amount).toBe(100);
    }
  });

  it("enqueue edit + delete(same id): replaces edit with a single delete", () => {
    enqueue(EDIT_REAL);
    enqueue(DELETE_REAL);
    const q = readQueue();
    expect(q).toHaveLength(1);
    expect(q[0]).toEqual(DELETE_REAL);
  });

  it("enqueue two different adds: both present in order", () => {
    const addB: QueueItem = { op: "add", tempId: -2002, payload: { ...ADD_A.payload, amount: 99 } };
    enqueue(ADD_A);
    enqueue(addB);
    const q = readQueue();
    expect(q).toHaveLength(2);
    expect(q[0].op === "add" && q[0].tempId).toBe(-1001);
    expect(q[1].op === "add" && q[1].tempId).toBe(-2002);
  });

  it("clearQueue: empties the queue", () => {
    enqueue(ADD_A);
    enqueue(EDIT_REAL);
    clearQueue();
    expect(readQueue()).toEqual([]);
  });

  it("readQueue returns [] when localStorage has corrupted JSON", () => {
    localStorage.setItem("ms_queue", "{invalid-json}");
    expect(readQueue()).toEqual([]);
  });

  it("enqueue edit after delete on same id: appends as safety fallback", () => {
    enqueue(DELETE_REAL);
    enqueue(EDIT_REAL);
    const q = readQueue();
    expect(q).toHaveLength(2);
    expect(q[0]).toEqual(DELETE_REAL);
    expect(q[1]).toEqual(EDIT_REAL);
  });
});
