import { describe, it, expect, vi } from "vitest";
import { runExclusive } from "./locking";

describe("runExclusive", () => {
  it("waits for the lock, runs fn, and returns fn's result", () => {
    const order: string[] = [];
    const lock = {
      waitLock: vi.fn(() => order.push("waitLock")),
      releaseLock: vi.fn(() => order.push("releaseLock")),
    };

    const result = runExclusive(lock, 10_000, () => {
      order.push("fn");
      return 42;
    });

    expect(result).toBe(42);
    expect(order).toEqual(["waitLock", "fn", "releaseLock"]);
    expect(lock.waitLock).toHaveBeenCalledWith(10_000);
  });

  it("releases the lock even when fn throws, and rethrows fn's error", () => {
    const lock = { waitLock: vi.fn(), releaseLock: vi.fn() };

    expect(() =>
      runExclusive(lock, 10_000, () => {
        throw new Error("boom");
      })
    ).toThrow("boom");

    expect(lock.releaseLock).toHaveBeenCalledTimes(1);
  });

  it("never calls fn or releaseLock when waitLock itself throws (timeout)", () => {
    const fn = vi.fn();
    const lock = {
      waitLock: vi.fn(() => {
        throw new Error("timeout");
      }),
      releaseLock: vi.fn(),
    };

    expect(() => runExclusive(lock, 10_000, fn)).toThrow("timeout");

    expect(fn).not.toHaveBeenCalled();
    expect(lock.releaseLock).not.toHaveBeenCalled();
  });
});
