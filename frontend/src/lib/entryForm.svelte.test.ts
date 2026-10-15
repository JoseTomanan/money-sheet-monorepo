import { describe, it, expect, vi, afterEach } from "vitest";
import { createEntryForm } from "./entryForm.svelte";
import { addLeg } from "./splitEntry";
import { today } from "./format";
import { entryAmount } from "./amountField";
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
  it.each(['', '=SUM(10,)', '100-', '5*3', 'Infinity', '1.2.3'])('refuses %s rather than constructing an invalid amount', (amount) => {
    const form = makeForm();
    form.split = { legs: [{ tag: 'FOOD', amount }] };
    expect(form.saveDisabled).toBe(true);
    expect(() => form.buildMutation()).toThrow('Invalid formula');
    expect(() => form.buildMutation(42)).toThrow('Invalid formula');
    form.split = { legs: [{ tag: 'FOOD', amount: '10' }, { tag: 'TRANSIT', amount }] };
    expect(form.saveDisabled).toBe(true);
    expect(() => form.buildMutation()).toThrow('Invalid formula');
  });
  it.each([
    ['100-30', 70], ['=SUM(10,5)', 15], ['1.234+0', 1.23],
    ['1.239+0', 1.24], ['1.234', 1.234], ['-1.234', -1.23], ['0', 0],
  ])("carries %s through Add, Edit, and Split before and after blur", (raw, expected) => {
    for (const direction of ['I', 'O'] as const) {
      const form = makeForm();
      form.setDirection(direction);
      const blurred = entryAmount.resolve(raw).amount ?? raw;
      for (const amount of [raw, blurred]) {
        form.split = { legs: [{ tag: 'FOOD', amount }] };
        expect(form.saveDisabled).toBe(false);
        expect(form.buildMutation()).toMatchObject({ payload: { amount: expected } });
        expect(form.buildMutation(42)).toMatchObject({ id: 42, patch: { amount: expected } });
        form.addLeg();
        form.updateLeg(1, { tag: 'TRANSIT', amount });
        expect(form.buildMutation()).toMatchObject({ payload: [
          { amount: expected }, { amount: expected, description: '^^' },
        ] });
      }
    }
  });
  it("submits raw arithmetic without requiring blur", () => {
    const form = makeForm();
    form.split = { legs: [{ tag: "Dining", amount: "100-30" }] };
    expect(form.saveDisabled).toBe(false);
    expect(form.buildMutation()).toMatchObject({ type: "add", payload: { amount: 70 } });
  });

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

describe("createEntryForm — default date", () => {
  const originalTZ = process.env.TZ;
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTZ;
  });

  it("defaults to the local calendar day, not the UTC day", () => {
    process.env.TZ = "America/New_York"; // UTC-4 in summer (EDT)
    vi.useFakeTimers();
    // 2026-05-24T02:00:00Z is still 2026-05-23 22:00 in New York.
    vi.setSystemTime(new Date("2026-05-24T02:00:00Z"));

    const form = makeForm();
    expect(form.date).toBe(today());
    expect(form.date).toBe("2026-05-23");
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

  it("saveDisabled false for a negative or zero amount on an Outgoing entry (ADR-0012)", () => {
    const form = makeForm();
    form.split = { legs: [{ tag: "Dining", amount: "-50" }] };
    // direction defaults to O
    expect(form.saveDisabled).toBe(false);
    form.split = { legs: [{ tag: "Dining", amount: "0" }] };
    expect(form.saveDisabled).toBe(false);
  });
});

describe("createEntryForm — saveDisabledReason", () => {
  it("is null when the form is valid", () => {
    const form = makeForm();
    form.split = { legs: [{ tag: "Dining", amount: "100" }] };
    expect(form.saveDisabledReason).toBeNull();
  });

  it("explains why Save is disabled when the tag is missing", () => {
    const form = makeForm();
    form.split = { legs: [{ tag: "", amount: "100" }] };
    expect(form.saveDisabledReason).toBe("Pick a tag");
  });
});
