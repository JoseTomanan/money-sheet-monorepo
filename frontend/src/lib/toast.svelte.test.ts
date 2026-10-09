import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("toast module", () => {
  beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("auto-dismisses a default-variant, no-action toast after 3s", async () => {
    vi.useFakeTimers();
    const { toast } = await import("./toast.svelte");
    toast.show("saved");
    expect(toast.msg).toBe("saved");
    await vi.advanceTimersByTimeAsync(3000);
    expect(toast.msg).toBeNull();
  });

  it("a destructive toast remains for 8s then completely resets", async () => {
    vi.useFakeTimers();
    const { toast } = await import("./toast.svelte");
    toast.show("unauthorized", undefined, "destructive");
    await vi.advanceTimersByTimeAsync(3000);
    expect(toast.msg).toBe("unauthorized");
    await vi.advanceTimersByTimeAsync(5000);
    expect(toast.msg).toBeNull();
    expect(toast.action).toBeNull();
    expect(toast.isConnection).toBe(false);
    expect(toast.variant).toBe("default");
  });

  it("an actionable toast expires after 8s and replacement gets a full duration", async () => {
    vi.useFakeTimers();
    const { toast } = await import("./toast.svelte");
    const action = { label: "Retry", run: () => {} };
    toast.show("failed", action);
    await vi.advanceTimersByTimeAsync(3000);
    expect(toast.msg).toBe("failed");
    expect(toast.action).toEqual(action);
    toast.show("new failure", action);
    await vi.advanceTimersByTimeAsync(7999);
    expect(toast.msg).toBe("new failure");
    await vi.advanceTimersByTimeAsync(1);
    expect(toast.msg).toBeNull();
    expect(toast.action).toBeNull();
  });

  it("dismiss() clears msg, action, isConnection, and resets variant to default", async () => {
    const { ConnectionError } = await import("./api");
    const { toast } = await import("./toast.svelte");
    toast.show(new ConnectionError("offline"), { label: "Retry", run: () => {} }, "destructive");
    expect(toast.msg).not.toBeNull();
    toast.dismiss();
    expect(toast.msg).toBeNull();
    expect(toast.action).toBeNull();
    expect(toast.isConnection).toBe(false);
    expect(toast.variant).toBe("default");
  });

  it("isConnection is true when the shown error is queueable (ConnectionError)", async () => {
    const { ConnectionError } = await import("./api");
    const { toast } = await import("./toast.svelte");
    toast.show(new ConnectionError("offline"), { label: "Retry", run: () => {} });
    expect(toast.isConnection).toBe(true);
  });

  it("coerces an Error to its message", async () => {
    const { toast } = await import("./toast.svelte");
    toast.show(new Error("boom"), { label: "Retry", run: () => {} });
    expect(toast.msg).toBe("boom");
    expect(toast.isError).toBe(true);
  });

  it("allows 8s for connection notifications offering Settings recovery", async () => {
    const { ConnectionError } = await import('./api');
    const { toast } = await import('./toast.svelte');
    toast.show(new ConnectionError('offline'));
    await vi.advanceTimersByTimeAsync(7999);
    expect(toast.msg).toBe('offline');
    await vi.advanceTimersByTimeAsync(1);
    expect(toast.msg).toBeNull();
    expect(toast.isError).toBe(false);
  });

  it("resumes remaining time only when hover, focus and visibility pauses all end", async () => {
    const { toast } = await import("./toast.svelte");
    toast.show("saved");
    await vi.advanceTimersByTimeAsync(1000);
    toast.pause("hover");
    toast.pause("focus");
    toast.pause("hidden");
    await vi.advanceTimersByTimeAsync(10000);
    toast.resume("hover");
    toast.resume("focus");
    await vi.advanceTimersByTimeAsync(10000);
    expect(toast.msg).toBe("saved");
    toast.resume("hidden");
    await vi.advanceTimersByTimeAsync(1999);
    expect(toast.msg).toBe("saved");
    await vi.advanceTimersByTimeAsync(1);
    expect(toast.msg).toBeNull();
  });

  it("replacement while paused gets a full duration and expiry clears presentation", async () => {
    const { toast } = await import("./toast.svelte");
    toast.show("saved");
    await vi.advanceTimersByTimeAsync(2000);
    toast.pause("hover");
    toast.show("Not updated: entries.", { label: "Retry", run: () => {} }, "destructive", {
      heading: "Couldn't refresh your data",
    });
    await vi.advanceTimersByTimeAsync(10000);
    expect(toast.presentation?.heading).toBe("Couldn't refresh your data");
    toast.resume("hover");
    await vi.advanceTimersByTimeAsync(7999);
    expect(toast.msg).toBe("Not updated: entries.");
    await vi.advanceTimersByTimeAsync(1);
    expect(toast.msg).toBeNull();
    expect(toast.presentation).toBeNull();
  });

  it("ordinary replacement and manual dismissal cancel earlier deadlines", async () => {
    const { toast } = await import("./toast.svelte");
    toast.show("first");
    await vi.advanceTimersByTimeAsync(2000);
    toast.show("second");
    await vi.advanceTimersByTimeAsync(1000);
    expect(toast.msg).toBe("second");
    toast.dismiss();
    expect(vi.getTimerCount()).toBe(0);
    toast.show("third");
    await vi.advanceTimersByTimeAsync(2000);
    expect(toast.msg).toBe("third");
    await vi.advanceTimersByTimeAsync(1000);
    expect(toast.msg).toBeNull();
  });
});
