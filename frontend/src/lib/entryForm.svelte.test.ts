import { describe, it, expect } from "vitest";
import { createEntryForm } from "./entryForm.svelte";
import { addLeg } from "./splitEntry";
import type { CategoryMap, Entry } from "./types";

const CATEGORIES: CategoryMap = {
  FOOD: ["Groceries", "Dining"],
  TRANSIT: ["Commute Fare", "Fuel"],
};

function makeForm() {
  return createEntryForm(() => CATEGORIES);
}

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 42,
    date: "2026-05-01",
    tag: "Dining",
    mainCategory: "FOOD",
    description: "Lunch",
    direction: "O",
    amount: 150,
    ...overrides,
  };
}

describe("createEntryForm — buildMutation", () => {
  it("1-leg new entry → { type:'add', payload } as a single object (not array)", () => {
    const form = makeForm();
    form.split = { legs: [{ tag: "Dining", amount: "100" }] };
    form.description = "test";
    const m = form.buildMutation();
    expect(m.type).toBe("add");
    expect(Array.isArray((m as any).payload)).toBe(false);
    expect((m as any).payload).toMatchObject({ tag: "Dining", amount: 100 });
  });

  it("single-leg payload carries no ^^ description", () => {
    const form = makeForm();
    form.split = { legs: [{ tag: "Dining", amount: "200" }] };
    form.description = "pizza";
    const m = form.buildMutation() as { type: "add"; payload: any };
    expect(m.payload.description).toBe("pizza");
  });

  it("2-leg new entry → { type:'add', payload } as an array", () => {
    const form = makeForm();
    form.split = {
      legs: [
        { tag: "Dining", amount: "100" },
        { tag: "Fuel", amount: "200" },
      ],
    };
    form.description = "split test";
    const m = form.buildMutation() as { type: "add"; payload: any[] };
    expect(m.type).toBe("add");
    expect(Array.isArray(m.payload)).toBe(true);
    expect(m.payload).toHaveLength(2);
    expect(m.payload[0].description).toBe("split test");
    expect(m.payload[1].description).toBe("^^");
  });

  it("edit entry → { type:'edit', id, patch } from legs[0]", () => {
    const form = makeForm();
    form.reset(makeEntry());
    const m = form.buildMutation(42) as { type: "edit"; id: number; patch: any };
    expect(m.type).toBe("edit");
    expect(m.id).toBe(42);
    expect(m.patch).toMatchObject({ tag: "Dining", amount: 150 });
  });
});

describe("createEntryForm — reset", () => {
  it("reset with entry → 1 prefilled leg", () => {
    const form = makeForm();
    form.reset(makeEntry());
    expect(form.split.legs).toHaveLength(1);
    expect(form.split.legs[0].tag).toBe("Dining");
    expect(form.split.legs[0].amount).toBe("150");
  });

  it("reset with entry → title starts with 'Edit'", () => {
    const form = makeForm();
    form.reset(makeEntry());
    expect(form.title).toMatch(/^Edit/);
  });

  it("reset without entry → 1 empty leg", () => {
    const form = makeForm();
    form.reset(makeEntry());       // seed with an entry first
    form.reset(null, "O");          // then reset to new
    expect(form.split.legs).toHaveLength(1);
    expect(form.split.legs[0].tag).toBe("");
    expect(form.title).toMatch(/^New/);
  });
});

describe("createEntryForm — saveDisabled / #50 guard", () => {
  it("saveDisabled true when leg tag mismatches direction (Incoming direction, subcategory tag)", () => {
    const form = makeForm();
    // direction=I but tag=Dining (a subcategory) — tag/direction mismatch
    form.split = { legs: [{ tag: "Dining", amount: "100" }] };
    form.setDirection("I");
    expect(form.saveDisabled).toBe(true);
  });

  it("saveDisabled false for a valid Outgoing entry (subcategory tag)", () => {
    const form = makeForm();
    form.split = { legs: [{ tag: "Dining", amount: "100" }] };
    // direction defaults to O
    expect(form.saveDisabled).toBe(false);
  });

  it("saveDisabled false for a valid Incoming entry (category tag)", () => {
    const form = makeForm();
    form.setDirection("I");
    form.split = { legs: [{ tag: "FOOD", amount: "500" }] };
    expect(form.saveDisabled).toBe(false);
  });

  it("saveDisabled true when leg has no tag", () => {
    const form = makeForm();
    form.split = { legs: [{ tag: "", amount: "100" }] };
    expect(form.saveDisabled).toBe(true);
  });

  it("saveDisabled true when leg amount is empty", () => {
    const form = makeForm();
    form.split = { legs: [{ tag: "Dining", amount: "" }] };
    expect(form.saveDisabled).toBe(true);
  });
});
