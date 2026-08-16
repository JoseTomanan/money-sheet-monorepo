import { describe, it, expect } from "vitest";
import {
  DITTO_DESCRIPTION,
  isDitto,
  initSplitState,
  addLeg,
  removeLeg,
  updateLeg,
  validateLeg,
  validateSplit,
  toAddEntryPayloads,
} from "./splitEntry";
import type { CategoryMap } from "./types";

const CATEGORIES: CategoryMap = {
  FOOD: ["Groceries", "Dining"],
  HOUSING: ["Rent", "Utilities"],
};

describe("DITTO_DESCRIPTION", () => {
  it("is exported and equals the sentinel '^^' value", () => {
    expect(DITTO_DESCRIPTION).toBe("^^");
  });

  it("is what toAddEntryPayloads writes for all-but-first legs", () => {
    const state = updateLeg(
      updateLeg(addLeg(initSplitState()), 0, { tag: "FOOD", amount: "100" }),
      1, { tag: "HOUSING", amount: "200" }
    );
    const payloads = toAddEntryPayloads(state, { date: "2026-01-01", description: "main", direction: "I" });
    expect(payloads[1].description).toBe(DITTO_DESCRIPTION);
  });
});

describe("isDitto", () => {
  it("is true for the bare sentinel and for descriptions starting with it", () => {
    expect(isDitto("^^")).toBe(true);
    expect(isDitto("^^ groceries")).toBe(true);
    expect(isDitto("^^^")).toBe(true);
  });

  it("is false for descriptions that don't start with the sentinel", () => {
    expect(isDitto("groceries")).toBe(false);
    expect(isDitto("")).toBe(false);
    expect(isDitto(" ^^")).toBe(false);
  });
});

describe("initSplitState", () => {
  it("returns exactly 1 empty leg", () => {
    const state = initSplitState();
    expect(state.legs).toHaveLength(1);
    expect(state.legs[0]).toEqual({ tag: "", amount: "" });
  });
});

describe("addLeg", () => {
  it("appends an empty leg", () => {
    const state = addLeg(initSplitState());
    expect(state.legs).toHaveLength(2);
    expect(state.legs[1]).toEqual({ tag: "", amount: "" });
  });
});

describe("toAddEntryPayloads", () => {
  it("emits one payload per leg sharing date and description, each with direction I", () => {
    // Build a 2-leg state: init gives 1 leg, addLeg gives 2
    const state = updateLeg(
      updateLeg(addLeg(initSplitState()), 0, { tag: "FOOD", amount: "500" }),
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
      updateLeg(addLeg(initSplitState()), 0, { tag: "Dining", amount: "250" }),
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
    // 1 → 2 → 3 legs
    const state = addLeg(
      updateLeg(
        updateLeg(addLeg(initSplitState()), 0, { tag: "Dining", amount: "200" }),
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

describe("validateSplit — superseding isSplitValid (ADR-0012)", () => {
  it("fails when any leg has no tag", () => {
    // single-leg state: amount set but no tag
    const state = updateLeg(initSplitState(), 0, { amount: "100" });
    expect(validateSplit(state, "O", CATEGORIES).ok).toBe(false);
  });

  it("fails when any leg has an unparseable amount", () => {
    const twoLegs = addLeg(initSplitState());
    const state = updateLeg(
      updateLeg(twoLegs, 0, { tag: "FOOD", amount: "abc" }),
      1, { tag: "HOUSING", amount: "200" }
    );
    expect(validateSplit(state, "O", CATEGORIES).ok).toBe(false);
  });

  it("is ok when all legs have a tag and a positive amount (single leg)", () => {
    const state = updateLeg(initSplitState(), 0, { tag: "FOOD", amount: "500" });
    expect(validateSplit(state, "O", CATEGORIES)).toEqual({ ok: true });
  });

  it("is ok for a negative or zero amount, on either direction (ADR-0012)", () => {
    const negative = updateLeg(initSplitState(), 0, { tag: "HOUSING", amount: "-50" });
    expect(validateSplit(negative, "O", CATEGORIES)).toEqual({ ok: true });
    const zero = updateLeg(initSplitState(), 0, { tag: "HOUSING", amount: "0" });
    expect(validateSplit(zero, "O", CATEGORIES)).toEqual({ ok: true });
  });

  it("is ok when all legs have a tag and a positive amount (two legs)", () => {
    const twoLegs = addLeg(initSplitState());
    const state = updateLeg(
      updateLeg(twoLegs, 0, { tag: "FOOD", amount: "500" }),
      1, { tag: "HOUSING", amount: "200" }
    );
    expect(validateSplit(state, "O", CATEGORIES)).toEqual({ ok: true });
  });

  it("fails when any leg has a formula error set, even if amount string looks numeric", () => {
    // error flag must be checked independently — parseFloat("100") > 0 would pass without the check
    const twoLegs = addLeg(initSplitState());
    const state = updateLeg(
      updateLeg(twoLegs, 0, { tag: "FOOD", amount: "100", error: "Invalid formula" }),
      1, { tag: "HOUSING", amount: "200" }
    );
    expect(validateSplit(state, "O", CATEGORIES).ok).toBe(false);
  });

  it("is ok when all legs are valid and error is explicitly cleared (undefined)", () => {
    const twoLegs = addLeg(initSplitState());
    const state = updateLeg(
      updateLeg(twoLegs, 0, { tag: "FOOD", amount: "100", error: undefined }),
      1, { tag: "HOUSING", amount: "200" }
    );
    expect(validateSplit(state, "O", CATEGORIES)).toEqual({ ok: true });
  });
});

describe("validateLeg", () => {
  it("rejects an empty tag with a reason", () => {
    const leg = { tag: "", amount: "50" };
    const result = validateLeg(leg, "O", CATEGORIES);
    expect(result.ok).toBe(false);
    expect(result).toHaveProperty("reason");
  });

  it("rejects a Subcategory tag on an Incoming leg, with a direction-specific reason (#50)", () => {
    // Silent-corruption scenario: direction='I' but tag is a Subcategory ('Dining').
    const leg = { tag: "Dining", amount: "50" };
    const result = validateLeg(leg, "I", CATEGORIES);
    expect(result).toEqual({ ok: false, reason: "Tag must be a Category" });
  });

  it("gives a plain 'Enter an amount' reason for a blank amount, not the raw formula error (ADR-0012)", () => {
    // Distinguishing blank-because-untouched from a malformed formula matters once the
    // UI surfaces `reason` directly — see EntrySheet.svelte's saveDisabledReason banner.
    const result = validateLeg({ tag: "Dining", amount: "" }, "O", CATEGORIES);
    expect(result).toEqual({ ok: false, reason: "Enter an amount" });
  });

  it("accepts a zero or negative amount on an Outgoing leg (ADR-0012 regression pin, at the validateLeg interface)", () => {
    const zero = validateLeg({ tag: "Dining", amount: "0" }, "O", CATEGORIES);
    expect(zero).toEqual({ ok: true });
    const negative = validateLeg({ tag: "Dining", amount: "-50" }, "O", CATEGORIES);
    expect(negative).toEqual({ ok: true });
  });
});

describe("validateSplit", () => {
  it("returns the first failing leg's reason across multiple legs", () => {
    const state = updateLeg(
      updateLeg(addLeg(initSplitState()), 0, { tag: "FOOD", amount: "500" }),
      1, { tag: "", amount: "200" } // leg 1 has no tag
    );
    const result = validateSplit(state, "O", CATEGORIES);
    expect(result).toEqual({ ok: false, reason: "Pick a tag" });
  });

  it("is ok when every leg is individually valid", () => {
    const state = updateLeg(
      updateLeg(addLeg(initSplitState()), 0, { tag: "Dining", amount: "500" }),
      1, { tag: "Rent", amount: "200" }
    );
    expect(validateSplit(state, "O", CATEGORIES)).toEqual({ ok: true });
  });
});

describe("updateLeg", () => {
  it("patches the leg at the given index without affecting others", () => {
    const twoLegs = addLeg(initSplitState());
    const state = updateLeg(twoLegs, 0, { tag: "FOOD", amount: "500" });
    expect(state.legs[0]).toEqual({ tag: "FOOD", amount: "500" });
    expect(state.legs[1]).toEqual({ tag: "", amount: "" });
  });
});

describe("removeLeg", () => {
  it("removes the leg at the given index", () => {
    // start at 1, add to 2, remove index 1 → back to 1
    const two = addLeg(initSplitState());
    const state = removeLeg(two, 1);
    expect(state.legs).toHaveLength(1);
    expect(state.legs[0]).toEqual(two.legs[0]);
  });

  it("refuses to drop below 1 leg", () => {
    const one = initSplitState();
    const state = removeLeg(one, 0);
    expect(state).toBe(one);
  });
});
