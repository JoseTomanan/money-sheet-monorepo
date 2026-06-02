import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import EntryDescBand from "./EntryDescBand.svelte";

function baseProps(overrides = {}) {
  return {
    description: "Test entry",
    pastel: "#eee",
    color: "#333",
    dot: "#3b82f6",
    ...overrides,
  };
}

describe("EntryDescBand — direction-based styling", () => {
  it("applies font-bold when direction=I (incoming)", () => {
    const { getByText } = render(EntryDescBand, baseProps({ direction: 'I' }));
    const span = getByText("Test entry");
    expect(span).toHaveClass("font-bold");
    expect(span).not.toHaveClass("font-normal");
  });

  it("applies font-normal when direction=O (outgoing)", () => {
    const { getByText } = render(EntryDescBand, baseProps({ direction: 'O' }));
    const span = getByText("Test entry");
    expect(span).toHaveClass("font-normal");
    expect(span).not.toHaveClass("font-bold");
  });

  it("default (no direction prop) uses font-normal", () => {
    const { getByText } = render(EntryDescBand, baseProps());
    const span = getByText("Test entry");
    expect(span).toHaveClass("font-normal");
    expect(span).not.toHaveClass("font-bold");
  });
});
