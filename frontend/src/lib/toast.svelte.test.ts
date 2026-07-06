import { describe, it, expect, afterEach, vi } from "vitest";
import { ConnectionError } from "./api";

describe("toast module", () => {
  afterEach(() => {
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

  it("a destructive-variant toast is not auto-dismissed after 3s", async () => {
    vi.useFakeTimers();
    const { toast } = await import("./toast.svelte");
    toast.show("unauthorized", undefined, "destructive");
    await vi.advanceTimersByTimeAsync(3000);
    expect(toast.msg).toBe("unauthorized");
  });

  it("a toast with an action is not auto-dismissed after 3s", async () => {
    vi.useFakeTimers();
    const { toast } = await import("./toast.svelte");
    const action = { label: "Retry", run: () => {} };
    toast.show("failed", action);
    await vi.advanceTimersByTimeAsync(3000);
    expect(toast.msg).toBe("failed");
    expect(toast.action).toEqual(action);
  });

  it("dismiss() clears msg, action, isConnection, and resets variant to default", async () => {
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
    const { toast } = await import("./toast.svelte");
    toast.show(new ConnectionError("offline"), { label: "Retry", run: () => {} });
    expect(toast.isConnection).toBe(true);
  });

  it("coerces an Error to its message", async () => {
    const { toast } = await import("./toast.svelte");
    toast.show(new Error("boom"), { label: "Retry", run: () => {} });
    expect(toast.msg).toBe("boom");
  });
});
