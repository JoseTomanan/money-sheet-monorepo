import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import EntryDescBand from "./EntryDescBand.svelte";

function baseProps(overrides = {}) {
  return {
    description: "Test entry",
    pastel: "#eee",
    color: "#333",
    ...overrides,
  };
}

describe("EntryDescBand — plain (Incoming) styling", () => {
  it("applies font-semibold and italic classes when plain=true", () => {
    const { getByText } = render(EntryDescBand, baseProps({ plain: true }));
    const span = getByText("Test entry");
    expect(span).toHaveClass("font-semibold");
    expect(span).toHaveClass("italic");
    expect(span).not.toHaveClass("font-medium");
  });

  it("applies font-medium (not italic) when plain=false", () => {
    const { getByText } = render(EntryDescBand, baseProps({ plain: false }));
    const span = getByText("Test entry");
    expect(span).toHaveClass("font-medium");
    expect(span).not.toHaveClass("italic");
    expect(span).not.toHaveClass("font-semibold");
  });

  it("default (no plain prop) uses font-medium, not italic", () => {
    const { getByText } = render(EntryDescBand, baseProps());
    const span = getByText("Test entry");
    expect(span).toHaveClass("font-medium");
    expect(span).not.toHaveClass("italic");
  });
});
