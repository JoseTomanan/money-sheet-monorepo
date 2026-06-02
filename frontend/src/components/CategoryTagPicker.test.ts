import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import CategoryTagPicker from "./CategoryTagPicker.svelte";
import type { CategoryMap } from "../lib/types";

const CATEGORIES: CategoryMap = {
  FOOD: ["Groceries", "Dining"],
  TRANSIT: ["Commute Fare", "Fuel"],
};

function baseProps(overrides = {}) {
  return {
    direction: "O" as const,
    categories: CATEGORIES,
    tag: "",
    onselect: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Outgoing — two-step picker
// ---------------------------------------------------------------------------

describe("CategoryTagPicker — Outgoing: category row (tracer)", () => {
  it("renders Category pills for every category", () => {
    const { getByRole } = render(CategoryTagPicker, baseProps());
    expect(getByRole("button", { name: /^FOOD$/ })).toBeInTheDocument();
    expect(getByRole("button", { name: /^TRANSIT$/ })).toBeInTheDocument();
  });

  it("shows no subcategory pills until a Category is tapped", () => {
    const { queryByRole } = render(CategoryTagPicker, baseProps());
    expect(queryByRole("button", { name: /^Groceries$/ })).not.toBeInTheDocument();
    expect(queryByRole("button", { name: /^Dining$/ })).not.toBeInTheDocument();
    expect(queryByRole("button", { name: /^Commute Fare$/ })).not.toBeInTheDocument();
    expect(queryByRole("button", { name: /^Fuel$/ })).not.toBeInTheDocument();
  });
});

describe("CategoryTagPicker — Outgoing: tapping a Category expands subcategories", () => {
  it("shows only that Category's subcategories after tapping", async () => {
    const { getByRole, queryByRole } = render(CategoryTagPicker, baseProps());
    await fireEvent.click(getByRole("button", { name: /^FOOD$/ }));
    expect(getByRole("button", { name: /^Groceries$/ })).toBeInTheDocument();
    expect(getByRole("button", { name: /^Dining$/ })).toBeInTheDocument();
    // Other category's subs not shown
    expect(queryByRole("button", { name: /^Fuel$/ })).not.toBeInTheDocument();
  });
});

describe("CategoryTagPicker — Outgoing: collapse on re-tap", () => {
  it("collapses the subcategory row when the active Category is tapped again", async () => {
    const { getByRole, queryByRole } = render(CategoryTagPicker, baseProps());
    await fireEvent.click(getByRole("button", { name: /^FOOD$/ }));
    expect(getByRole("button", { name: /^Groceries$/ })).toBeInTheDocument();
    // tap again
    await fireEvent.click(getByRole("button", { name: /^FOOD$/ }));
    expect(queryByRole("button", { name: /^Groceries$/ })).not.toBeInTheDocument();
  });
});

describe("CategoryTagPicker — Outgoing: selecting a subcategory", () => {
  it("calls onselect with the subcategory value", async () => {
    const props = baseProps();
    const { getByRole } = render(CategoryTagPicker, props);
    await fireEvent.click(getByRole("button", { name: /^FOOD$/ }));
    await fireEvent.click(getByRole("button", { name: /^Dining$/ }));
    expect(props.onselect).toHaveBeenCalledWith("Dining");
  });

  it("Category row stays visible and Category stays expanded after subcategory selected", async () => {
    const props = baseProps(); // start with no selection
    const { getByRole } = render(CategoryTagPicker, props);
    await fireEvent.click(getByRole("button", { name: /^FOOD$/ }));
    await fireEvent.click(getByRole("button", { name: /^Dining$/ }));
    // Category row still visible
    expect(getByRole("button", { name: /^FOOD$/ })).toBeInTheDocument();
    expect(getByRole("button", { name: /^TRANSIT$/ })).toBeInTheDocument();
    // Subcategory row still expanded
    expect(getByRole("button", { name: /^Groceries$/ })).toBeInTheDocument();
  });
});

describe("CategoryTagPicker — Outgoing: switching categories", () => {
  it("collapses previous and expands the new Category", async () => {
    const { getByRole, queryByRole } = render(CategoryTagPicker, baseProps());
    await fireEvent.click(getByRole("button", { name: /^FOOD$/ }));
    expect(getByRole("button", { name: /^Groceries$/ })).toBeInTheDocument();
    await fireEvent.click(getByRole("button", { name: /^TRANSIT$/ }));
    expect(queryByRole("button", { name: /^Groceries$/ })).not.toBeInTheDocument();
    expect(getByRole("button", { name: /^Fuel$/ })).toBeInTheDocument();
  });
});

describe("CategoryTagPicker — Outgoing edit prefill", () => {
  it("pre-expands the parent Category when a tag is provided", () => {
    const { getByRole } = render(CategoryTagPicker, baseProps({ tag: "Dining" }));
    // FOOD subcategories should be visible immediately
    expect(getByRole("button", { name: /^Groceries$/ })).toBeInTheDocument();
    expect(getByRole("button", { name: /^Dining$/ })).toBeInTheDocument();
  });

  it("marks the pre-selected subcategory as pressed", () => {
    const { getByRole } = render(CategoryTagPicker, baseProps({ tag: "Dining" }));
    expect(getByRole("button", { name: /^Dining$/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("marks the pre-expanded Category as pressed", () => {
    const { getByRole } = render(CategoryTagPicker, baseProps({ tag: "Dining" }));
    expect(getByRole("button", { name: /^FOOD$/ })).toHaveAttribute("aria-pressed", "true");
  });
});

// ---------------------------------------------------------------------------
// Incoming — category-only picker
// ---------------------------------------------------------------------------

describe("CategoryTagPicker — Incoming: category-only picker", () => {
  function incomingProps(overrides = {}) {
    return baseProps({ direction: "I" as const, ...overrides });
  }

  it("shows Category pills and no subcategory row ever (even after tap)", async () => {
    const { getByRole, queryByRole } = render(CategoryTagPicker, incomingProps());
    expect(getByRole("button", { name: /^FOOD$/ })).toBeInTheDocument();
    await fireEvent.click(getByRole("button", { name: /^FOOD$/ }));
    expect(queryByRole("button", { name: /^Groceries$/ })).not.toBeInTheDocument();
  });

  it("calls onselect with the Category when a Category pill is tapped", async () => {
    const props = incomingProps();
    const { getByRole } = render(CategoryTagPicker, props);
    await fireEvent.click(getByRole("button", { name: /^FOOD$/ }));
    expect(props.onselect).toHaveBeenCalledWith("FOOD");
  });

  it("marks the selected Category as aria-pressed when tag matches", () => {
    const { getByRole } = render(CategoryTagPicker, incomingProps({ tag: "FOOD" }));
    expect(getByRole("button", { name: /^FOOD$/ })).toHaveAttribute("aria-pressed", "true");
    expect(getByRole("button", { name: /^TRANSIT$/ })).toHaveAttribute("aria-pressed", "false");
  });
});
