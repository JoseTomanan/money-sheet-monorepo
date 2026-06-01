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
      direction: "I",
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
      description: "^^",
      direction: "I",
      amount: 1500.5,
    });
  });

  it("emits one payload per leg with direction O; subsequent legs use ^^ description", () => {
    const state = updateLeg(
      updateLeg(initSplitState(), 0, { tag: "Dining", amount: "250" }),
      1, { tag: "Fuel", amount: "800" }
    );
    const payloads = toAddEntryPayloads(state, {
      date: "2026-05-22",
      description: "weekly expenses",
      direction: "O",
    });
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toEqual({
      date: "2026-05-22",
      tag: "Dining",
      description: "weekly expenses",
      direction: "O",
      amount: 250,
    });
    expect(payloads[1]).toEqual({
      date: "2026-05-22",
      tag: "Fuel",
      description: "^^",
      direction: "O",
      amount: 800,
    });
  });

  it("uses ^^ for all legs after the first in a 3-leg Outgoing split", () => {
    const state = addLeg(
      updateLeg(
        updateLeg(initSplitState(), 0, { tag: "Dining", amount: "200" }),
        1, { tag: "Fuel", amount: "500" }
      )
    );
    const three = updateLeg(state, 2, { tag: "Grooming", amount: "150" });
    const payloads = toAddEntryPayloads(three, {
      date: "2026-05-23",
      description: "May expenses",
      direction: "O",
    });
    expect(payloads).toHaveLength(3);
    expect(payloads[0].description).toBe("May expenses");
    expect(payloads[1].description).toBe("^^");
    expect(payloads[2].description).toBe("^^");
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

  it("is false when any leg has a formula error set, even if amount string looks numeric", () => {
    // error flag must be checked independently — parseFloat("100") > 0 would pass without the check
    const state = updateLeg(
      updateLeg(initSplitState(), 0, { tag: "FOOD", amount: "100", error: "Invalid formula" }),
      1, { tag: "HOUSING", amount: "200" }
    );
    expect(isSplitValid(state)).toBe(false);
  });

  it("is true when all legs are valid and error is explicitly cleared (undefined)", () => {
    const state = updateLeg(
      updateLeg(initSplitState(), 0, { tag: "FOOD", amount: "100", error: undefined }),
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
