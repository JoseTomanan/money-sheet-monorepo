import { describe, it, expect } from "vitest";
import { startDrag, moveDrag, endDrag } from "./dragGesture";

describe("startDrag", () => {
  it("captures startY, startSnap, and sets offsetY to 0", () => {
    const state = startDrag(300, "default");
    expect(state).toEqual({ startY: 300, startSnap: "default", offsetY: 0 });
  });
});

describe("moveDrag", () => {
  it("produces positive offsetY when finger moves down", () => {
    const state = moveDrag(startDrag(300, "default"), 380);
    expect(state.offsetY).toBe(80);
  });

  it("produces negative offsetY when finger moves up", () => {
    const state = moveDrag(startDrag(300, "default"), 220);
    expect(state.offsetY).toBe(-80);
  });

  it("preserves startY and startSnap", () => {
    const state = moveDrag(startDrag(300, "expanded"), 320);
    expect(state.startY).toBe(300);
    expect(state.startSnap).toBe("expanded");
  });
});

describe("endDrag — from default", () => {
  it("returns dismiss when offset exceeds dismissPx", () => {
    const state = moveDrag(startDrag(0, "default"), 81);
    expect(endDrag(state)).toEqual({ action: "dismiss" });
  });

  it("returns snap to expanded when offset exceeds -switchPx upward", () => {
    const state = moveDrag(startDrag(0, "default"), -61);
    expect(endDrag(state)).toEqual({ action: "snap", to: "expanded" });
  });

  it("snaps back to default when neither threshold is crossed", () => {
    const state = moveDrag(startDrag(0, "default"), 30);
    expect(endDrag(state)).toEqual({ action: "snap", to: "default" });
  });
});

describe("endDrag — from expanded", () => {
  it("snaps to default when offset exceeds switchPx", () => {
    const state = moveDrag(startDrag(0, "expanded"), 61);
    expect(endDrag(state)).toEqual({ action: "snap", to: "default" });
  });

  it("returns dismiss when offset exceeds dismissPx + switchPx", () => {
    const state = moveDrag(startDrag(0, "expanded"), 141);
    expect(endDrag(state)).toEqual({ action: "dismiss" });
  });

  it("snaps back to expanded when held below threshold", () => {
    const state = moveDrag(startDrag(0, "expanded"), 20);
    expect(endDrag(state)).toEqual({ action: "snap", to: "expanded" });
  });
});
