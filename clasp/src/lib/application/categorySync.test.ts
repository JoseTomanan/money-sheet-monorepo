import { describe, expect, it, vi } from "vitest";
import { applyCategorySync } from "./categorySync";

describe("Category-sync application", () => {
  it("retags confirmed Outgoing Entries inside the supplied transaction", () => {
    const events: string[] = [];
    const retag = vi.fn(() => 2);

    const result = applyCategorySync({
      change: { kind: "rename", oldValue: "Dining", newTag: "Eating Out" },
      count: () => 2,
      confirm: (count) => { events.push(`confirm:${count}`); return true; },
      transact: (work) => { events.push("lock:start"); const value = work(); events.push("lock:end"); return value; },
      retag: (oldTag, newTag) => { events.push("retag"); return retag(oldTag, newTag); },
      onLockFailure: () => { throw new Error("not used"); },
    });

    expect(result).toEqual({ status: "applied", count: 2 });
    expect(retag).toHaveBeenCalledWith("Dining", "Eating Out");
    expect(events).toEqual(["confirm:2", "lock:start", "retag", "lock:end"]);
  });

  it("returns a deferred outcome and preserves the planned change when locking fails", () => {
    const change = { kind: "delete" as const, oldValue: "Dining", newTag: "FOOD" };
    const onLockFailure = vi.fn();

    expect(applyCategorySync({
      change,
      count: () => 3,
      confirm: () => true,
      transact: () => { throw new Error("lock timeout"); },
      retag: () => { throw new Error("not reached"); },
      onLockFailure,
    })).toEqual({ status: "deferred", count: 3 });
    expect(onLockFailure).toHaveBeenCalledWith(change);
  });
});
