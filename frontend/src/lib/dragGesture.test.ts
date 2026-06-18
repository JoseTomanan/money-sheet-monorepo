import { describe, it, expect } from "vitest";
import { startDrag, moveDrag, endDrag } from "./dragGesture";

// All calls use explicit timestamps so velocity is deterministic.
// For displacement-only tests, a 1000 ms window keeps velocity well below
// the 0.5 px/ms flick threshold regardless of offset.

describe("startDrag", () => {
  it("captures startY, startSnap, offsetY, and initialises velocity to 0", () => {
    const state = startDrag(300, "default", 1000);
    expect(state).toEqual({ startY: 300, startSnap: "default", offsetY: 0, lastY: 300, lastT: 1000, velocity: 0 });
  });
});

describe("moveDrag", () => {
  it("produces positive offsetY when finger moves down", () => {
    const state = moveDrag(startDrag(300, "default", 0), 380, 1000);
    expect(state.offsetY).toBe(80);
  });

  it("produces negative offsetY when finger moves up", () => {
    const state = moveDrag(startDrag(300, "default", 0), 220, 1000);
    expect(state.offsetY).toBe(-80);
  });

  it("preserves startY and startSnap", () => {
    const state = moveDrag(startDrag(300, "expanded", 0), 320, 1000);
    expect(state.startY).toBe(300);
    expect(state.startSnap).toBe("expanded");
  });

  it("computes velocity from displacement and elapsed time", () => {
    const state = moveDrag(startDrag(0, "default", 0), 100, 200);
    expect(state.velocity).toBeCloseTo(0.5); // 100px / 200ms
  });

  it("produces negative velocity when moving upward", () => {
    const state = moveDrag(startDrag(300, "default", 0), 220, 200);
    expect(state.velocity).toBeCloseTo(-0.4); // -80px / 200ms
  });

  it("retains previous velocity when dt is zero", () => {
    const state = moveDrag(startDrag(0, "default", 1000), 50, 1000);
    expect(state.velocity).toBe(0);
  });
});

describe("endDrag — from default (displacement)", () => {
  it("returns dismiss when offset exceeds dismissPx", () => {
    const state = moveDrag(startDrag(0, "default", 0), 81, 1000); // velocity 0.081, offset 81
    expect(endDrag(state)).toEqual({ action: "dismiss" });
  });

  it("returns snap to expanded when offset exceeds -switchPx upward", () => {
    const state = moveDrag(startDrag(0, "default", 0), -61, 1000); // velocity -0.061, offset -61
    expect(endDrag(state)).toEqual({ action: "snap", to: "expanded" });
  });

  it("snaps back to default when neither threshold is crossed", () => {
    const state = moveDrag(startDrag(0, "default", 0), 30, 1000); // velocity 0.03, offset 30
    expect(endDrag(state)).toEqual({ action: "snap", to: "default" });
  });
});

describe("endDrag — from expanded (displacement)", () => {
  it("snaps to default when offset exceeds switchPx", () => {
    const state = moveDrag(startDrag(0, "expanded", 0), 61, 1000);
    expect(endDrag(state)).toEqual({ action: "snap", to: "default" });
  });

  it("returns dismiss when offset exceeds dismissPx + switchPx", () => {
    const state = moveDrag(startDrag(0, "expanded", 0), 141, 1000);
    expect(endDrag(state)).toEqual({ action: "dismiss" });
  });

  it("snaps back to expanded when held below threshold", () => {
    const state = moveDrag(startDrag(0, "expanded", 0), 20, 1000);
    expect(endDrag(state)).toEqual({ action: "snap", to: "expanded" });
  });
});

describe("endDrag — velocity flick", () => {
  // 21px / 40ms = 0.525 px/ms, just above the 0.5 flick threshold

  it("dismisses on downward flick from default despite small displacement", () => {
    const state = moveDrag(startDrag(0, "default", 0), 21, 40);
    expect(endDrag(state)).toEqual({ action: "dismiss" });
  });

  it("expands on upward flick from default despite small displacement", () => {
    const state = moveDrag(startDrag(0, "default", 0), -21, 40);
    expect(endDrag(state)).toEqual({ action: "snap", to: "expanded" });
  });

  it("dismisses on downward flick from expanded despite small displacement", () => {
    const state = moveDrag(startDrag(0, "expanded", 0), 21, 40);
    expect(endDrag(state)).toEqual({ action: "dismiss" });
  });

  it("respects custom flickVelocity threshold", () => {
    // velocity = 0.525 px/ms; with a higher threshold of 1.0, it should NOT flick-dismiss
    const state = moveDrag(startDrag(0, "default", 0), 21, 40);
    expect(endDrag(state, { flickVelocity: 1.0 })).toEqual({ action: "snap", to: "default" });
  });
});
