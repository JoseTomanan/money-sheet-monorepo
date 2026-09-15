/**
 * locking.ts — a pure wrapper around GAS's LockService.Lock, testable with a
 * fake. Every mutation of the INCOMING/OUTGOING sheet must go through this
 * (see docs/adr/0009) — including the visibility/separator trigger, which
 * previously mutated the sheet without holding the document lock at all
 * (issue: blank/ID-less rows under concurrency).
 */

/** Structural subset of GoogleAppsScript.Lock.Lock needed by runExclusive. */
export interface DocumentLock {
  waitLock(timeoutInMillis: number): void;
  releaseLock(): void;
}

/**
 * Acquires `lock` (waiting up to `timeoutMs`), runs `fn`, and always releases
 * the lock afterward — even if `fn` throws. If `waitLock` itself throws
 * (timeout), `fn` never runs and no release is attempted.
 */
export function runExclusive<T>(lock: DocumentLock, timeoutMs: number, fn: () => T): T {
  lock.waitLock(timeoutMs);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
