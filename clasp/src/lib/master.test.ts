import { describe, expect, it } from "vitest";
import { parseMasterRows } from "./master";

describe("parseMasterRows", () => {
  it("returns ON HAND and every recognized Category budget", () => {
    expect(parseMasterRows(
      ["ON HAND", "HOUSING", "FOOD", "TRANSIT", "HEALTH", "FINANCE", "LIFESTYLE", "MISC"],
      [1500, 100, "200", 0, "not a number", 500, -10, 30]
    )).toEqual({
      onHand: 1500,
      budgets: { HOUSING: 100, FOOD: 200, TRANSIT: 0, HEALTH: 0, FINANCE: 500, LIFESTYLE: -10, MISC: 30 },
    });
  });

  it("ignores blank headers", () => {
    expect(parseMasterRows(["ON HAND", "", "  "], [10, 20, 30])).toEqual({ onHand: 10, budgets: {} });
  });

  it("rejects an unknown non-empty budget header instead of returning partial budgets", () => {
    expect(() => parseMasterRows(["ON HAND", "FOOD", "TRAVEL"], [10, 20, 30]))
      .toThrow("Unknown MASTER budget header: TRAVEL");
  });
});
