import { describe, it, expect } from "vitest";
import { render } from "@testing-library/svelte";
import TagPill from "./TagPill.svelte";

describe("TagPill", () => {
  it("renders the tag text", () => {
    const { getByText } = render(TagPill, {
      tag: "Groceries",
      direction: "O",
      mainCategory: "FOOD",
    });
    expect(getByText("Groceries")).toBeInTheDocument();
  });

  it("applies the category soft background from CATEGORIES lookup", () => {
    const { getByText } = render(TagPill, {
      tag: "Groceries",
      direction: "O",
      mainCategory: "FOOD",
    });
    const el = getByText("Groceries");
    // FOOD soft is rgba(26, 138, 63, 0.14) — check the rendered style contains it
    const style = el.getAttribute("style") ?? "";
    expect(style).toMatch(/rgba\(26,\s*138,\s*63/);
  });

  it("falls back to muted-foreground style for unknown category", () => {
    const { getByText } = render(TagPill, {
      tag: "Unknown",
      direction: "O",
      mainCategory: "NONEXISTENT",
    });
    const el = getByText("Unknown");
    expect(el.getAttribute("style")).toContain("muted-foreground");
  });

  it("small=true reduces font size relative to default", () => {
    const { getByText: getDefault } = render(TagPill, {
      tag: "Rent",
      direction: "O",
      mainCategory: "HOUSING",
    });
    const { getByText: getSmall } = render(TagPill, {
      tag: "SmallRent",
      direction: "O",
      mainCategory: "HOUSING",
      small: true,
    });
    const defaultEl = getDefault("Rent");
    const smallEl = getSmall("SmallRent");
    const defaultSize = parseInt(
      defaultEl.getAttribute("style")?.match(/font-size:\s*(\d+)px/)?.[1] ?? "99"
    );
    const smallSize = parseInt(
      smallEl.getAttribute("style")?.match(/font-size:\s*(\d+)px/)?.[1] ?? "0"
    );
    expect(smallSize).toBeLessThan(defaultSize);
  });
});
