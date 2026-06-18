import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import SplitLegCarousel from "./SplitLegCarousel.svelte";
import { initSplitState, addLeg } from "../../lib/splitEntry";
import type { CategoryMap } from "../../lib/types";

const CATEGORIES: CategoryMap = {
  FOOD: ["Groceries", "Dining"],
  TRANSIT: ["Commute Fare", "Fuel"],
};

function baseProps(overrides = {}) {
  return {
    split: initSplitState(),
    direction: "O" as const,
    categories: CATEGORIES,
    onupdate: vi.fn(),
    onremove: vi.fn(),
    onadd: vi.fn(),
    ...overrides,
  };
}

describe("SplitLegCarousel", () => {
  it("renders one card per leg plus an Add leg button", () => {
    const { getAllByText, getByText } = render(SplitLegCarousel, baseProps());
    expect(getAllByText(/^Remove$/)).toHaveLength(2);
    expect(getByText("Add leg")).toBeInTheDocument();
  });

  it("calls onadd when Add leg is clicked", async () => {
    const props = baseProps();
    const { getByText } = render(SplitLegCarousel, props);
    await fireEvent.click(getByText("Add leg"));
    expect(props.onadd).toHaveBeenCalledOnce();
  });

  it("calls onremove with the leg index when Remove is clicked", async () => {
    const split = addLeg(initSplitState()); // 3 legs so Remove is enabled
    const props = baseProps({ split });
    const { getAllByText } = render(SplitLegCarousel, props);
    const removes = getAllByText(/^Remove$/);
    await fireEvent.click(removes[1]);
    expect(props.onremove).toHaveBeenCalledWith(1);
  });

  it("disables Remove buttons when there are exactly 2 legs", () => {
    const props = baseProps(); // initSplitState has 2 legs
    const { getAllByText } = render(SplitLegCarousel, props);
    const removes = getAllByText(/^Remove$/);
    removes.forEach((btn) => expect(btn).toBeDisabled());
  });

  it("enables Remove buttons when there are 3 or more legs", () => {
    const split = addLeg(initSplitState());
    const props = baseProps({ split });
    const { getAllByText } = render(SplitLegCarousel, props);
    const removes = getAllByText(/^Remove$/);
    removes.forEach((btn) => expect(btn).not.toBeDisabled());
  });

  it("calls onupdate with stripped numeric value when amount changes", async () => {
    const props = baseProps();
    const { getAllByPlaceholderText } = render(SplitLegCarousel, props);
    const inputs = getAllByPlaceholderText("0.00");
    await fireEvent.input(inputs[0], { target: { value: "1a2b3.4" } });
    expect(props.onupdate).toHaveBeenCalledWith(0, { amount: "123.4" });
  });

  it("passes formula characters through oninput without stripping", async () => {
    const props = baseProps();
    const { getAllByPlaceholderText } = render(SplitLegCarousel, props);
    const inputs = getAllByPlaceholderText("0.00");
    await fireEvent.input(inputs[0], { target: { value: "=10+5" } });
    expect(props.onupdate).toHaveBeenCalledWith(0, { amount: "=10+5" });
  });

  it("on blur with valid formula calls onupdate with resolved amount and no error", async () => {
    const props = baseProps();
    const { getAllByPlaceholderText } = render(SplitLegCarousel, props);
    const inputs = getAllByPlaceholderText("0.00");
    // Set the formula value first
    await fireEvent.input(inputs[0], { target: { value: "=10+5" } });
    // Blur should evaluate and call onupdate with the resolved value
    await fireEvent.blur(inputs[0]);
    expect(props.onupdate).toHaveBeenLastCalledWith(0, { amount: "15.00", error: undefined });
  });

  it("on blur with malformed formula calls onupdate with an error", async () => {
    const props = baseProps();
    const { getAllByPlaceholderText } = render(SplitLegCarousel, props);
    const inputs = getAllByPlaceholderText("0.00");
    await fireEvent.input(inputs[0], { target: { value: "=10+abc" } });
    await fireEvent.blur(inputs[0]);
    const lastCall = props.onupdate.mock.calls.at(-1) as [number, { error: string }];
    expect(lastCall[0]).toBe(0);
    expect(lastCall[1]).toHaveProperty("error");
  });

  it("on blur with plain number after prior formula error clears the error", async () => {
    // Regression: updateLeg spreads patches, so { amount: "50" } alone leaves leg.error intact.
    // onblur must explicitly pass error: undefined when the field is no longer a formula.
    const props = baseProps();
    const { getAllByPlaceholderText } = render(SplitLegCarousel, props);
    const inputs = getAllByPlaceholderText("0.00");
    // First, set a formula error
    await fireEvent.input(inputs[0], { target: { value: "=10+abc" } });
    await fireEvent.blur(inputs[0]);
    const errorCall = props.onupdate.mock.calls.at(-1) as [number, { error: string }];
    expect(errorCall[1]).toHaveProperty("error");
    // Then correct to a plain number
    await fireEvent.input(inputs[0], { target: { value: "50" } });
    await fireEvent.blur(inputs[0]);
    const clearCall = props.onupdate.mock.calls.at(-1) as [number, { error: undefined }];
    expect(clearCall[1]).toEqual({ error: undefined });
  });

  it("on blur with formula resolving to non-positive calls onupdate with an error", async () => {
    const props = baseProps();
    const { getAllByPlaceholderText } = render(SplitLegCarousel, props);
    const inputs = getAllByPlaceholderText("0.00");
    await fireEvent.input(inputs[0], { target: { value: "=5-10" } });
    await fireEvent.blur(inputs[0]);
    const lastCall = props.onupdate.mock.calls.at(-1) as [number, { error: string }];
    expect(lastCall[0]).toBe(0);
    expect(lastCall[1]).toHaveProperty("error");
  });

  it("calls onupdate with subcategory tag via two-step picker (FOOD → Dining)", async () => {
    const props = baseProps();
    const { getAllByRole } = render(SplitLegCarousel, props);
    // expand FOOD in the first leg card
    const foodBtns = getAllByRole("button", { name: /^FOOD$/ });
    await fireEvent.click(foodBtns[0]);
    // select Dining in the first leg card
    const diningBtns = getAllByRole("button", { name: /^Dining$/ });
    await fireEvent.click(diningBtns[0]);
    expect(props.onupdate).toHaveBeenCalledWith(0, { tag: "Dining" });
  });
});
