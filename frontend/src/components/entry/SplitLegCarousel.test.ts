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
    showAddCard: true,
    ...overrides,
  };
}

describe("SplitLegCarousel", () => {
  it("keeps the surviving middle-removal draft and focus attached to its leg", async () => {
    const split = { legs: [{ tag: '', amount: '10' }, { tag: '', amount: '20' }, { tag: '', amount: '30' }] };
    const props = baseProps({ split });
    const view = render(SplitLegCarousel, props);
    const last = view.getByLabelText('Amount for leg 3');
    props.onremove.mockImplementation((index: number) => {
      void view.rerender({ split: { legs: split.legs.filter((_, i) => i !== index) } });
    });
    await fireEvent.click(view.getAllByText('Remove')[1]);
    expect(view.getByLabelText('Amount for leg 2')).toBe(last);
    expect(last).toHaveValue('30');
    expect(last).toHaveFocus();
  });

  it("does not animate keyboard removal", async () => {
    const animate = vi.fn();
    const original = Element.prototype.animate;
    Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
    try {
      const props = baseProps({ split: addLeg(initSplitState()) });
      const view = render(SplitLegCarousel, props);
      await fireEvent.click(view.getAllByText('Remove')[1], { detail: 0 });
      expect(props.onremove).toHaveBeenCalledWith(1);
      expect(animate).not.toHaveBeenCalled();
    } finally {
      Element.prototype.animate = original;
    }
  });
  it("animates a pointer-added leg and focuses its amount", async () => {
    const animate = vi.fn(() => ({ finished: Promise.resolve() }));
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    const original = Element.prototype.animate;
    Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
    try {
      const props = baseProps();
      const view = render(SplitLegCarousel, props);
      props.onadd.mockImplementation(() => { void view.rerender({ split: addLeg(props.split) }); });
      await fireEvent.click(view.getByText('Add leg'), { detail: 1 });
      expect(view.getByLabelText('Amount for leg 2')).toHaveFocus();
      expect(animate).toHaveBeenCalledOnce();
    } finally {
      Element.prototype.animate = original;
      vi.unstubAllGlobals();
    }
  });
  it("keeps the pointer exit above the sheet until its owner closes", async () => {
    const animate = vi.fn(() => ({ finished: new Promise(() => {}) }));
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    const original = Element.prototype.animate;
    Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
    try {
      const view = render(SplitLegCarousel, baseProps({ split: addLeg(initSplitState()) }));
      await fireEvent.click(view.getAllByText('Remove')[1], { detail: 1 });
      const ghost = document.body.querySelector<HTMLElement>('[aria-hidden="true"][inert]');
      expect(ghost).not.toBeNull();
      expect(ghost!.parentElement).toHaveStyle({ zIndex: '201', overflow: 'hidden' });
      view.unmount();
      expect(ghost!.isConnected).toBe(false);
    } finally {
      Element.prototype.animate = original;
      vi.unstubAllGlobals();
    }
  });
  it("animates a pointer removal without delaying the removal callback", async () => {
    const animate = vi.fn(() => ({ finished: Promise.resolve() }));
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    const original = Element.prototype.animate;
    Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
    try {
      const props = baseProps({ split: addLeg(initSplitState()) });
      const view = render(SplitLegCarousel, props);
      await fireEvent.click(view.getAllByText('Remove')[1], { detail: 1 });
      expect(props.onremove).toHaveBeenCalledWith(1);
      expect(animate).toHaveBeenCalledOnce();
    } finally {
      Element.prototype.animate = original;
      vi.unstubAllGlobals();
    }
  });
  it("renders one card per leg plus an Add leg button when showAddCard=true", () => {
    // initSplitState now gives 1 leg
    const { getAllByText, getByText } = render(SplitLegCarousel, baseProps());
    expect(getAllByText(/^Remove$/)).toHaveLength(1);
    expect(getByText("Add leg")).toBeInTheDocument();
  });

  it("does not render the Add leg button when showAddCard=false", () => {
    const { queryByText } = render(SplitLegCarousel, baseProps({ showAddCard: false }));
    expect(queryByText("Add leg")).not.toBeInTheDocument();
  });

  it("calls onadd when Add leg is clicked", async () => {
    const props = baseProps();
    const { getByText } = render(SplitLegCarousel, props);
    await fireEvent.click(getByText("Add leg"));
    expect(props.onadd).toHaveBeenCalledOnce();
  });

  it("calls onremove with the leg index when Remove is clicked", async () => {
    const split = addLeg(initSplitState()); // 2 legs so Remove is enabled
    const props = baseProps({ split });
    const { getAllByText } = render(SplitLegCarousel, props);
    const removes = getAllByText(/^Remove$/);
    await fireEvent.click(removes[1]);
    expect(props.onremove).toHaveBeenCalledWith(1);
  });

  it("disables Remove button when there is exactly 1 leg", () => {
    const props = baseProps(); // initSplitState now gives 1 leg
    const { getAllByText } = render(SplitLegCarousel, props);
    const removes = getAllByText(/^Remove$/);
    removes.forEach((btn) => expect(btn).toBeDisabled());
  });

  it("enables Remove buttons when there are 2 or more legs", () => {
    const split = addLeg(initSplitState()); // 1 → 2 legs
    const props = baseProps({ split });
    const { getAllByText } = render(SplitLegCarousel, props);
    const removes = getAllByText(/^Remove$/);
    removes.forEach((btn) => expect(btn).not.toBeDisabled());
  });

  it("shows each leg's position in the split", () => {
    const split = addLeg(initSplitState());
    const { getByText } = render(SplitLegCarousel, baseProps({ split }));

    expect(getByText("Leg 1 of 2")).toBeInTheDocument();
    expect(getByText("Leg 2 of 2")).toBeInTheDocument();
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

  it("passes bare arithmetic operators through oninput without stripping", async () => {
    const props = baseProps();
    const { getAllByPlaceholderText } = render(SplitLegCarousel, props);
    const inputs = getAllByPlaceholderText("0.00");
    await fireEvent.input(inputs[0], { target: { value: "100-50" } });
    expect(props.onupdate).toHaveBeenCalledWith(0, { amount: "100-50" });
  });

  it("on blur with bare arithmetic resolves to the computed amount", async () => {
    const props = baseProps();
    const { getAllByPlaceholderText } = render(SplitLegCarousel, props);
    const inputs = getAllByPlaceholderText("0.00");
    await fireEvent.input(inputs[0], { target: { value: "100-50" } });
    await fireEvent.blur(inputs[0]);
    expect(props.onupdate).toHaveBeenLastCalledWith(0, { amount: "50.00", error: undefined });
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

  it("on blur with formula resolving to non-positive resolves cleanly, no error (ADR-0012)", async () => {
    const props = baseProps();
    const { getAllByPlaceholderText } = render(SplitLegCarousel, props);
    const inputs = getAllByPlaceholderText("0.00");
    await fireEvent.input(inputs[0], { target: { value: "=5-10" } });
    await fireEvent.blur(inputs[0]);
    const lastCall = props.onupdate.mock.calls.at(-1) as [number, { amount: string; error?: string }];
    expect(lastCall[0]).toBe(0);
    expect(lastCall[1]).toEqual({ amount: "-5.00", error: undefined });
  });

  it("on blur with a plain negative amount (-50) resolves cleanly, no error (ADR-0012)", async () => {
    const props = baseProps();
    const { getAllByPlaceholderText } = render(SplitLegCarousel, props);
    const inputs = getAllByPlaceholderText("0.00");
    await fireEvent.input(inputs[0], { target: { value: "-50" } });
    const lastInputCall = props.onupdate.mock.calls.at(-1) as [number, { amount: string }];
    expect(lastInputCall[1].amount).toBe("-50"); // sanitizeAmountInput keeps the leading '-'
    await fireEvent.blur(inputs[0]);
    // "-50" contains an operator char, so blur resolves it via evaluateAmountInput
    // (like a formula) rather than leaving it as bare typed text.
    const lastCall = props.onupdate.mock.calls.at(-1) as [number, { amount: string; error?: string }];
    expect(lastCall[1]).toEqual({ amount: "-50.00", error: undefined });
  });

  it("on blur with a plain zero amount (0) resolves cleanly, no error (ADR-0012)", async () => {
    const props = baseProps();
    const { getAllByPlaceholderText } = render(SplitLegCarousel, props);
    const inputs = getAllByPlaceholderText("0.00");
    await fireEvent.input(inputs[0], { target: { value: "0" } });
    await fireEvent.blur(inputs[0]);
    const lastCall = props.onupdate.mock.calls.at(-1) as [number, { error?: string }];
    expect(lastCall[1]).toEqual({ error: undefined });
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
