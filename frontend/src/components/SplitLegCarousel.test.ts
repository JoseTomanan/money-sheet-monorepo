import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import SplitLegCarousel from "./SplitLegCarousel.svelte";
import { initSplitState, addLeg } from "../lib/splitEntry";

const TAG_OPTIONS = [
  { value: "Dining", parentCat: "FOOD" },
  { value: "Fuel", parentCat: "TRANSIT" },
];

function baseProps(overrides = {}) {
  return {
    split: initSplitState(),
    tagOptions: TAG_OPTIONS,
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

  it("calls onupdate with tag when a tag pill is clicked", async () => {
    const props = baseProps();
    const { getAllByText } = render(SplitLegCarousel, props);
    const diningPills = getAllByText("Dining");
    await fireEvent.click(diningPills[0]);
    expect(props.onupdate).toHaveBeenCalledWith(0, { tag: "Dining" });
  });
});
