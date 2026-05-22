import { describe, it, expect } from "vitest";
import {
  initSplitState,
  addLeg,
  removeLeg,
  updateLeg,
  isSplitValid,
  toAddEntryPayloads,
} from "./splitEntry";

describe("initSplitState", () => {
  it("returns exactly 2 empty legs", () => {
    const state = initSplitState();
    expect(state.legs).toHaveLength(2);
    expect(state.legs[0]).toEqual({ tag: "", amount: "" });
    expect(state.legs[1]).toEqual({ tag: "", amount: "" });
  });
});

describe("addLeg", () => {
  it("appends an empty leg", () => {
    const state = addLeg(initSplitState());
    expect(state.legs).toHaveLength(3);
    expect(state.legs[2]).toEqual({ tag: "", amount: "" });
  });
});

describe("toAddEntryPayloads", () => {
  it("emits one payload per leg sharing date and description, each with direction I", () => {
    const state = updateLeg(
      updateLeg(initSplitState(), 0, { tag: "FOOD", amount: "500" }),
      1, { tag: "HOUSING", amount: "1500.50" }
    );
    const payloads = toAddEntryPayloads(state, {
      date: "2026-05-21",
      description: "payday",
    });
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toEqual({
      date: "2026-05-21",
      tag: "FOOD",
      description: "payday",
      direction: "I",
      amount: 500,
    });
    expect(payloads[1]).toEqual({
      date: "2026-05-21",
      tag: "HOUSING",
      description: "payday",
      direction: "I",
      amount: 1500.5,
    });
  });
});

describe("isSplitValid", () => {
  it("is false when any leg has no tag", () => {
    const state = updateLeg(initSplitState(), 0, { amount: "100" });
    expect(isSplitValid(state)).toBe(false);
  });

  it("is false when any leg has an unparseable amount", () => {
    const state = updateLeg(
      updateLeg(initSplitState(), 0, { tag: "FOOD", amount: "abc" }),
      1, { tag: "HOUSING", amount: "200" }
    );
    expect(isSplitValid(state)).toBe(false);
  });

  it("is false when any leg has amount <= 0", () => {
    const state = updateLeg(
      updateLeg(initSplitState(), 0, { tag: "FOOD", amount: "0" }),
      1, { tag: "HOUSING", amount: "200" }
    );
    expect(isSplitValid(state)).toBe(false);
  });

  it("is true when all legs have a tag and a positive amount", () => {
    const state = updateLeg(
      updateLeg(initSplitState(), 0, { tag: "FOOD", amount: "500" }),
      1, { tag: "HOUSING", amount: "200" }
    );
    expect(isSplitValid(state)).toBe(true);
  });
});

describe("updateLeg", () => {
  it("patches the leg at the given index without affecting others", () => {
    const state = updateLeg(initSplitState(), 0, { tag: "FOOD", amount: "500" });
    expect(state.legs[0]).toEqual({ tag: "FOOD", amount: "500" });
    expect(state.legs[1]).toEqual({ tag: "", amount: "" });
  });
});

describe("removeLeg", () => {
  it("removes the leg at the given index", () => {
    const three = addLeg(initSplitState());
    const state = removeLeg(three, 1);
    expect(state.legs).toHaveLength(2);
    expect(state.legs[0]).toEqual(three.legs[0]);
    expect(state.legs[1]).toEqual(three.legs[2]);
  });

  it("refuses to drop below 2 legs", () => {
    const two = initSplitState();
    const state = removeLeg(two, 0);
    expect(state).toBe(two);
  });
});
