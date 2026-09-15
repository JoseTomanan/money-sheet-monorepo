import { describe, expect, it } from "vitest";
import { entryInvariantViolation } from "./entry";

const categories = {
  FOOD: ["Groceries", "Dining"],
  HOUSING: ["Rent"],
};

describe("entryInvariantViolation", () => {
  it("accepts an Incoming Entry tagged with a Category", () => {
    expect(entryInvariantViolation({
      date: "2026-09-14",
      tag: "FOOD",
      direction: "I",
      amount: 100,
    }, categories)).toBeNull();
  });

  it("rejects a non-finite Entry amount", () => {
    expect(entryInvariantViolation({
      date: "2026-09-14",
      tag: "FOOD",
      direction: "I",
      amount: Number.POSITIVE_INFINITY,
    }, categories)).toBe('"amount" must be a finite number, got: null');
  });

  it("rejects an Entry date that is not an ISO calendar date", () => {
    expect(entryInvariantViolation({
      date: "September 14, 2026",
      tag: "FOOD",
      direction: "I",
      amount: 100,
    }, categories)).toBe(
      '"date" must be a valid ISO date string (YYYY-MM-DD), got: "September 14, 2026"'
    );
  });

  it("preserves polymorphic Tags for Outgoing Entries", () => {
    expect(entryInvariantViolation({
      date: "2026-09-14",
      tag: "Dining",
      direction: "O",
      amount: 100,
    }, categories)).toBeNull();
    expect(entryInvariantViolation({
      date: "2026-09-14",
      tag: "FOOD",
      direction: "O",
      amount: 100,
    }, categories)).toBeNull();
    expect(entryInvariantViolation({
      date: "2026-09-14",
      tag: "Dining",
      direction: "I",
      amount: 100,
    }, categories)).toContain("Incoming entries require a Category tag");
  });

  it("accepts finite Entry amounts of either sign, including zero", () => {
    for (const amount of [-100, 0, 100]) {
      expect(entryInvariantViolation({
        date: "2026-09-14",
        tag: "FOOD",
        direction: "I",
        amount,
      }, categories)).toBeNull();
    }
  });
});
