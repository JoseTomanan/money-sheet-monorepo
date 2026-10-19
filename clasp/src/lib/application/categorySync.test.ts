import { describe, expect, it, vi } from "vitest";
import { applyCategorySync, runCategorySync, retryCategorySync, type CategorySyncChange } from "./categorySync";
import { retagOutgoingRows, countMatchingOutgoingTags } from "../infrastructure/categorySync";
import { runExclusive } from "../infrastructure/locking";

describe("Category-sync application", () => {
  it("reports an interruption after work begins and retains the original mapping", () => {
    const change = { kind: "rename" as const, oldValue: "Dining", newTag: "Eating Out" };
    const retain = vi.fn();
    const tags = ["Dining", "Dining"];
    const result = applyCategorySync({
      change,
      count: () => 2,
      confirm: () => true,
      transact: (work) => work(),
      retag: () => { tags[0] = change.newTag; throw new Error("write interrupted"); },
      savePending: retain,
    });
    expect(result).toEqual({ status: "interrupted", count: 2 });
    expect(tags).toEqual(["Eating Out", "Dining"]);
    expect(retain).toHaveBeenCalledWith(change);
  });
  it("retags confirmed Outgoing Entries inside the supplied transaction", () => {
    const events: string[] = [];
    const retag = vi.fn(() => 2);

    const result = applyCategorySync({
      change: { kind: "rename", oldValue: "Dining", newTag: "Eating Out" },
      count: () => 2,
      confirm: (count) => { events.push(`confirm:${count}`); return true; },
      transact: (work) => { events.push("lock:start"); const value = work(); events.push("lock:end"); return value; },
      retag: (oldTag, newTag) => { events.push("retag"); return retag(oldTag, newTag); },
      savePending: () => { throw new Error("not used"); },
    });

    expect(result).toEqual({ status: "applied", count: 2 });
    expect(retag).toHaveBeenCalledWith("Dining", "Eating Out");
    expect(events).toEqual(["confirm:2", "lock:start", "retag", "lock:end"]);
  });

  it("returns a deferred outcome and preserves the planned change when locking fails", () => {
    const change = { kind: "delete" as const, oldValue: "Dining", newTag: "FOOD" };
    const savePending = vi.fn();

    expect(applyCategorySync({
      change,
      count: () => 3,
      confirm: () => true,
      transact: () => { throw new Error("lock timeout"); },
      retag: () => { throw new Error("not reached"); },
      savePending,
    })).toEqual({ status: "deferred", count: 3 });
    expect(savePending).toHaveBeenCalledWith(change);
  });
});

describe("Category-sync edit and retry owner", () => {
  it("retains interrupted work, retries only remaining Tags, and clears after success", () => {
    const tags = ["Dining", "Dining"];
    let pending: CategorySyncChange | null = null;
    let interrupt = true;
    const deps = {
      count: (tag: string) => tags.filter((value) => value === tag).length,
      confirm: vi.fn((_change: CategorySyncChange, _count: number, _retry: boolean) => true),
      transact: <T>(work: () => T): T => work(),
      retag: (oldTag: string, newTag: string) => {
        let count = 0;
        for (let i = 0; i < tags.length; i++) {
          if (tags[i] !== oldTag) continue;
          tags[i] = newTag;
          count++;
          if (interrupt) throw new Error("interrupted");
        }
        return count;
      },
      savePending: (change: CategorySyncChange) => { pending = change; },
      clearPending: () => { pending = null; },
    };
    expect(runCategorySync({
      ...deps,
      edit: { isSubcategoryCell: true, oldValue: "Dining", value: "Eating Out" },
      getCatalog: () => ({ parentCategory: "FOOD", categories: ["FOOD"], otherSubcategories: [] }),
    })).toEqual({ status: "interrupted", count: 2 });
    expect(tags).toEqual(["Eating Out", "Dining"]);
    expect(pending).toEqual({ kind: "rename", oldValue: "Dining", newTag: "Eating Out" });
    interrupt = false;
    expect(retryCategorySync({ ...deps, pending })).toEqual({ status: "applied", count: 1 });
    expect(tags).toEqual(["Eating Out", "Eating Out"]);
    expect(pending).toBeNull();
    expect(deps.confirm.mock.calls.map((call) => call[1])).toEqual([2, 1]);
  });
});

describe.each(["edit", "retry"] as const)("Category-sync %s outcomes", (source) => {
  it("decline leaves Tags and the pending record untouched", () => {
    const change = { kind: "delete" as const, oldValue: "Dining", newTag: "FOOD" };
    const retag = vi.fn();
    const savePending = vi.fn();
    const clearPending = vi.fn();
    const transact = vi.fn();
    const deps = { count: () => 2, confirm: () => false, retag, savePending, clearPending, transact };
    const result = source === "edit"
      ? runCategorySync({ ...deps, edit: { isSubcategoryCell: true, oldValue: "Dining" },
          getCatalog: () => ({ parentCategory: "FOOD", categories: ["FOOD"], otherSubcategories: [] }) })
      : retryCategorySync({ ...deps, pending: change });
    expect(result).toEqual({ status: "declined", count: 2 });
    expect(transact).not.toHaveBeenCalled();
    expect(retag).not.toHaveBeenCalled();
    expect(savePending).not.toHaveBeenCalled();
    expect(clearPending).not.toHaveBeenCalled();
  });
});

it.each(["edit", "retry"] as const)("%s retains the exact mapping on lock refusal, then converges under the shared lock", (source) => {
  const rows = [
    ["2026-10-20", "Dining", "FOOD", "Lunch", "O", 100, 1],
    ["2026-10-20", "Dining", "FOOD", "Dinner", "O", 100, 2],
    ["2026-10-20", "Dining", "FOOD", "Incoming", "I", 100, 3],
    ["2026-10-20", "Dining", "FOOD", "Separator", "O", 0, ""],
  ];
  const change = { kind: "delete" as const, oldValue: "Dining", newTag: "FOOD" };
  let pending: CategorySyncChange | null = source === "retry" ? change : null;
  let locked = false;
  let refuse = true;
  let interrupt = true;
  const repo = {
    readRows: () => rows,
    writeEntryFields: (row: number, fields: { tag?: string }) => {
      expect(locked).toBe(true);
      rows[row - 2][1] = fields.tag!;
      if (interrupt) throw new Error("write failed after applying first row");
    },
  };
  const lock = {
    waitLock: () => { if (refuse) throw new Error("timeout"); locked = true; },
    releaseLock: () => { locked = false; },
  };
  const deps = {
    count: (tag: string) => countMatchingOutgoingTags(rows, tag),
    confirm: () => true,
    transact: <T>(work: () => T): T => runExclusive(lock, 10000, work),
    retag: (oldTag: string, newTag: string) => retagOutgoingRows(repo, oldTag, newTag),
    savePending: (value: CategorySyncChange) => { pending = value; },
    clearPending: () => { pending = null; },
  };
  const first = source === "edit"
    ? runCategorySync({ ...deps, edit: { isSubcategoryCell: true, oldValue: "Dining" },
        getCatalog: () => ({ parentCategory: "FOOD", categories: ["FOOD"], otherSubcategories: [] }) })
    : retryCategorySync({ ...deps, pending });
  expect(first).toEqual({ status: "deferred", count: 2 });
  expect(rows.map((row) => row[1])).toEqual(["Dining", "Dining", "Dining", "Dining"]);
  expect(pending).toEqual(change);
  refuse = false;
  expect(retryCategorySync({ ...deps, pending })).toEqual({ status: "interrupted", count: 2 });
  expect(rows.map((row) => row[1])).toEqual(["FOOD", "Dining", "Dining", "Dining"]);
  expect(pending).toEqual(change);
  expect(locked).toBe(false);
  interrupt = false;
  expect(retryCategorySync({ ...deps, pending })).toEqual({ status: "applied", count: 1 });
  expect(rows.map((row) => row[1])).toEqual(["FOOD", "FOOD", "Dining", "Dining"]);
  expect(pending).toBeNull();
  expect(locked).toBe(false);
});

it.each([
  { edit: { isSubcategoryCell: false, oldValue: "Dining", value: "Eating Out" }, status: "ignored" },
  { edit: { isSubcategoryCell: true, value: "New" }, status: "ignored" },
  { edit: { isSubcategoryCell: true, oldValue: " Dining ", value: "Dining" }, status: "ignored" },
  { edit: { isSubcategoryCell: true, oldValue: "Dining", value: "FOOD" }, status: "blocked" },
  { edit: { isSubcategoryCell: true, oldValue: "Dining", value: "Rent" }, status: "blocked" },
])("$status edit never reaches confirmation or transaction: $edit", ({ edit, status }) => {
  const count = vi.fn();
  const confirm = vi.fn();
  const transact = vi.fn();
  const savePending = vi.fn();
  const getCatalog = vi.fn(() => ({ parentCategory: "FOOD", categories: ["FOOD", "HOUSING"],
    otherSubcategories: [{ name: "Rent", parent: "HOUSING" }] }));
  const result = runCategorySync({ edit, getCatalog, count, confirm, transact, savePending, retag: vi.fn() });
  expect(result.status).toBe(status);
  expect(count).not.toHaveBeenCalled();
  expect(confirm).not.toHaveBeenCalled();
  expect(transact).not.toHaveBeenCalled();
  expect(savePending).not.toHaveBeenCalled();
  if (status === "ignored") expect(getCatalog).not.toHaveBeenCalled();
});

it("clears a completed pending retry even when no old Tags remain", () => {
  let pending: CategorySyncChange | null = { kind: "rename", oldValue: "Dining", newTag: "Eating Out" };
  const result = retryCategorySync({
    pending,
    count: () => 0,
    confirm: () => true,
    transact: (work) => work(),
    retag: () => 0,
    savePending: (value) => { pending = value; },
    clearPending: () => { pending = null; },
  });
  expect(result).toEqual({ status: "applied", count: 0 });
  expect(pending).toBeNull();
});

it("blocks deletion without a parent Category before confirmation or writing", () => {
  const confirm = vi.fn();
  const retag = vi.fn();
  const result = runCategorySync({
    edit: { isSubcategoryCell: true, oldValue: "Dining" },
    getCatalog: () => ({ parentCategory: null, categories: [], otherSubcategories: [] }),
    count: vi.fn(), confirm, retag, transact: vi.fn(), savePending: vi.fn(),
  });
  expect(result.status).toBe("blocked");
  expect(confirm).not.toHaveBeenCalled();
  expect(retag).not.toHaveBeenCalled();
});
