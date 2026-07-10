import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import CategoryTagPicker from "./CategoryTagPicker.svelte";
import type { CategoryMap } from "../../lib/types";

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

  it("keeps the collapsed Category pill marked as pressed when its bare Category is the current tag", async () => {
    // tag="FOOD" simulates an entry already saved with a bare-Category tag (no
    // Subcategory) — mount pre-expands FOOD (see edit-prefill tests below).
    const { getByRole } = render(CategoryTagPicker, baseProps({ tag: "FOOD" }));
    // Collapse back to the flat category row by re-tapping the pinned pill.
    await fireEvent.click(getByRole("button", { name: /^FOOD$/ }));
    expect(getByRole("button", { name: /^FOOD$/ })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("CategoryTagPicker — Outgoing: selecting a bare Category (no subcategory, #123)", () => {
  it("never shows a separate 'No subcategory' pill — the big Category pill is the bare choice", async () => {
    const { queryByRole, getByRole } = render(CategoryTagPicker, baseProps());
    expect(queryByRole("button", { name: /No subcategory/ })).not.toBeInTheDocument();
    await fireEvent.click(getByRole("button", { name: /^FOOD$/ }));
    expect(queryByRole("button", { name: /No subcategory/ })).not.toBeInTheDocument();
  });

  it("calls onselect with the bare Category as soon as the Category pill is tapped", async () => {
    const props = baseProps();
    const { getByRole } = render(CategoryTagPicker, props);
    await fireEvent.click(getByRole("button", { name: /^FOOD$/ }));
    expect(props.onselect).toHaveBeenCalledWith("FOOD");
  });

  it("does not commit anything when the expanded pseudo-category is unknown (orphaned tag recovery)", () => {
    // Simulates an orphaned entry: its tag doesn't match any known Category or
    // Subcategory, so on mount `activeCategory` is seeded to the tag itself,
    // which is not a real key in `categories`.
    const { getByRole } = render(
      CategoryTagPicker,
      baseProps({ tag: "Ghost Subcategory" })
    );
    // Pinned pseudo-category pill is shown...
    expect(getByRole("button", { name: /Ghost Subcategory/ })).toBeInTheDocument();
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

  it("pinned Category stays visible and subcategory row stays expanded after subcategory selected; other categories hidden", async () => {
    const props = baseProps();
    const { getByRole, queryByRole } = render(CategoryTagPicker, props);
    await fireEvent.click(getByRole("button", { name: /FOOD/ }));
    await fireEvent.click(getByRole("button", { name: /^Dining$/ }));
    // Pinned chosen category still visible (as back pill)
    expect(getByRole("button", { name: /FOOD/ })).toBeInTheDocument();
    // Subcategory row still expanded
    expect(getByRole("button", { name: /^Groceries$/ })).toBeInTheDocument();
    // Peer category is hidden while expanded
    expect(queryByRole("button", { name: /^TRANSIT$/ })).not.toBeInTheDocument();
  });
});

describe("CategoryTagPicker — Outgoing: switching categories", () => {
  it("back then tap new Category: collapses previous subcategories and expands new", async () => {
    const { getByRole, queryByRole } = render(CategoryTagPicker, baseProps());
    // Drill into FOOD
    await fireEvent.click(getByRole("button", { name: /FOOD/ }));
    expect(getByRole("button", { name: /^Groceries$/ })).toBeInTheDocument();
    // Go back by re-tapping the pinned FOOD pill
    await fireEvent.click(getByRole("button", { name: /FOOD/ }));
    expect(queryByRole("button", { name: /^Groceries$/ })).not.toBeInTheDocument();
    // Now drill into TRANSIT
    await fireEvent.click(getByRole("button", { name: /^TRANSIT$/ }));
    expect(queryByRole("button", { name: /^Groceries$/ })).not.toBeInTheDocument();
    expect(getByRole("button", { name: /^Fuel$/ })).toBeInTheDocument();
  });
});

describe("CategoryTagPicker — Outgoing: drill-in hides peers", () => {
  it("hides other category pills once a Category is expanded", async () => {
    const { getByRole, queryByRole } = render(CategoryTagPicker, baseProps());
    await fireEvent.click(getByRole("button", { name: /FOOD/ }));
    // Chosen category's subs are visible
    expect(getByRole("button", { name: /^Groceries$/ })).toBeInTheDocument();
    expect(getByRole("button", { name: /^Dining$/ })).toBeInTheDocument();
    // Peer category is NOT visible
    expect(queryByRole("button", { name: /^TRANSIT$/ })).not.toBeInTheDocument();
  });

  it("re-tapping the pinned Category restores the full category list", async () => {
    const { getByRole, queryByRole } = render(CategoryTagPicker, baseProps());
    await fireEvent.click(getByRole("button", { name: /FOOD/ }));
    expect(queryByRole("button", { name: /^TRANSIT$/ })).not.toBeInTheDocument();
    // Tap FOOD again to go back
    await fireEvent.click(getByRole("button", { name: /FOOD/ }));
    // Both categories restored
    expect(getByRole("button", { name: /^FOOD$/ })).toBeInTheDocument();
    expect(getByRole("button", { name: /^TRANSIT$/ })).toBeInTheDocument();
    // Subcategories gone
    expect(queryByRole("button", { name: /^Groceries$/ })).not.toBeInTheDocument();
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

  it("does not mark the pinned Category as pressed when a Subcategory is the selected tag", () => {
    const { getByRole } = render(CategoryTagPicker, baseProps({ tag: "Dining" }));
    expect(getByRole("button", { name: /^FOOD$/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("pre-expands and marks the pinned Category as pressed when the tag is a bare Category", () => {
    const { getByRole } = render(CategoryTagPicker, baseProps({ tag: "FOOD" }));
    expect(getByRole("button", { name: /^Groceries$/ })).toBeInTheDocument();
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
