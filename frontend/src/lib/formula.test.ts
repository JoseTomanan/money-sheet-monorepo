import { describe, it, expect } from "vitest";
import { isFormula, evaluateFormula } from "./formula";

describe("isFormula", () => {
  it("returns true for strings starting with =", () => {
    expect(isFormula("=10+5")).toBe(true);
    expect(isFormula("= 10 + 5")).toBe(true);
    expect(isFormula("=SUM(10,5)")).toBe(true);
  });

  it("returns false for plain numeric strings", () => {
    expect(isFormula("50.00")).toBe(false);
    expect(isFormula("0")).toBe(false);
    expect(isFormula("")).toBe(false);
  });

  it("returns false for strings that do not start with =", () => {
    expect(isFormula("abc")).toBe(false);
    expect(isFormula("10+5")).toBe(false);
  });
});

describe("evaluateFormula — addition and subtraction", () => {
  it("evaluates =10+5 to 15", () => {
    expect(evaluateFormula("=10+5")).toEqual({ value: 15 });
  });

  it("evaluates =100-30 to 70", () => {
    expect(evaluateFormula("=100-30")).toEqual({ value: 70 });
  });

  it("evaluates a chain of additions", () => {
    expect(evaluateFormula("=10+5+3")).toEqual({ value: 18 });
  });

  it("evaluates a chain of mixed add/subtract", () => {
    expect(evaluateFormula("=100-30-20")).toEqual({ value: 50 });
  });

  it("ignores whitespace in the expression", () => {
    expect(evaluateFormula("= 10 + 5")).toEqual({ value: 15 });
  });

  it("returns a negative value when result is negative", () => {
    expect(evaluateFormula("=5-10")).toEqual({ value: -5 });
  });

  it("handles decimal operands", () => {
    expect(evaluateFormula("=10.5+4.5")).toEqual({ value: 15 });
  });
});

describe("evaluateFormula — SUM()", () => {
  it("evaluates =SUM(10,5) to 15", () => {
    expect(evaluateFormula("=SUM(10,5)")).toEqual({ value: 15 });
  });

  it("evaluates =100-SUM(30,20,15) to 35", () => {
    expect(evaluateFormula("=100-SUM(30,20,15)")).toEqual({ value: 35 });
  });

  it("evaluates =SUM(10,5)+SUM(1,2) to 18", () => {
    expect(evaluateFormula("=SUM(10,5)+SUM(1,2)")).toEqual({ value: 18 });
  });

  it("is case-insensitive for SUM", () => {
    expect(evaluateFormula("=sum(10,5)")).toEqual({ value: 15 });
  });

  it("handles decimal arguments inside SUM", () => {
    expect(evaluateFormula("=SUM(10.5,4.5)")).toEqual({ value: 15 });
  });
});

describe("evaluateFormula — error cases", () => {
  it("returns error for =10+abc", () => {
    const result = evaluateFormula("=10+abc");
    expect(result).toHaveProperty("error");
  });

  it("returns error for unclosed SUM — =SUM(", () => {
    const result = evaluateFormula("=SUM(");
    expect(result).toHaveProperty("error");
  });

  it("returns error for empty SUM — =SUM()", () => {
    const result = evaluateFormula("=SUM()");
    expect(result).toHaveProperty("error");
  });

  it("returns error for SUM with non-numeric arg — =SUM(a,5)", () => {
    const result = evaluateFormula("=SUM(a,5)");
    expect(result).toHaveProperty("error");
  });

  it("returns error for a standalone = with no expression", () => {
    const result = evaluateFormula("=");
    expect(result).toHaveProperty("error");
  });

  it("returns error for leftover text after valid prefix", () => {
    const result = evaluateFormula("=10+5abc");
    expect(result).toHaveProperty("error");
  });
});
