import { describe, it, expect } from "vitest";
import { entryAmount, redistributionAmount } from "./amountField";

describe("entryAmount / redistributionAmount — validate", () => {
  it("entryAmount accepts zero; redistributionAmount rejects it", () => {
    expect(entryAmount.validate("0")).toEqual({ value: 0 });
    expect(redistributionAmount.validate("0")).toEqual({ error: "Amount must be positive" });
  });
});

describe("entryAmount / redistributionAmount — resolve (onblur)", () => {
  it("entryAmount resolves a negative amount cleanly; redistributionAmount errors on it", () => {
    expect(entryAmount.resolve("-50")).toEqual({ amount: "-50.00", error: null });
    expect(redistributionAmount.resolve("-50")).toEqual({ amount: null, error: "Amount must be positive" });
  });
});

describe("entryAmount / redistributionAmount — sanitize (oninput)", () => {
  it("both delegate to the shared sanitizeAmountInput allowlist", () => {
    expect(entryAmount.sanitize("1a2b3.4")).toBe("123.4");
    expect(redistributionAmount.sanitize("1a2b3.4")).toBe("123.4");
  });
});
