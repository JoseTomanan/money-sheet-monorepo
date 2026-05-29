import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, within } from "@testing-library/svelte";
import WeekPicker from "./WeekPicker.svelte";

const WEEKS = [
  { key: "2026-05-03", label: "May 3 – 9, 2026" },
  { key: "2026-05-10", label: "May 10 – 16, 2026" },
  { key: "2026-05-24", label: "May 24 – 30, 2026" }, // current
];

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    weeks: WEEKS,
    currentWeekKey: "2026-05-24",
    value: "2026-05-24",
    onSelect: vi.fn(),
    ...overrides,
  };
}

describe("WeekPicker", () => {
  it("trigger shows the label of the selected value", () => {
    const { getByRole } = render(WeekPicker, baseProps());
    expect(getByRole("button")).toHaveTextContent("May 24 – 30, 2026");
  });

  it("opening the popover reveals current week under 'This week'", async () => {
    const { getByRole } = render(WeekPicker, baseProps());
    await fireEvent.click(getByRole("button"));

    const thisWeekHeading = document.body.querySelector("[data-this-week-heading]");
    expect(thisWeekHeading).toBeInTheDocument();

    // The current-week row text appears after the heading
    const rows = [...document.body.querySelectorAll("[data-week-row]")];
    const currentRow = rows.find(r => r.getAttribute("data-week-key") === "2026-05-24");
    expect(currentRow).toBeInTheDocument();
  });

  it("past weeks are newest-first", async () => {
    const { getByRole } = render(WeekPicker, baseProps());
    await fireEvent.click(getByRole("button"));

    const rows = [...document.body.querySelectorAll("[data-week-row]")];
    const keys = rows.map(r => r.getAttribute("data-week-key"));
    // Current week first, then past weeks newest → oldest
    expect(keys).toEqual(["2026-05-24", "2026-05-10", "2026-05-03"]);
  });

  it("active row is highlighted when value matches a past week", async () => {
    const { getByRole } = render(WeekPicker, baseProps({ value: "2026-05-10" }));
    await fireEvent.click(getByRole("button"));

    const activeRow = document.body.querySelector("[data-week-key='2026-05-10']");
    expect(activeRow).toHaveClass("text-accent");
    const inactiveRow = document.body.querySelector("[data-week-key='2026-05-03']");
    expect(inactiveRow).not.toHaveClass("text-accent");
  });

  it("clicking a past week calls onSelect and closes popover", async () => {
    const onSelect = vi.fn();
    const { getByRole } = render(WeekPicker, baseProps({ onSelect }));
    await fireEvent.click(getByRole("button")); // open

    const targetRow = document.body.querySelector("[data-week-key='2026-05-10']") as HTMLElement;
    await fireEvent.click(targetRow);

    expect(onSelect).toHaveBeenCalledWith("2026-05-10");
    // After close the rows should be gone from the DOM
    expect(document.body.querySelector("[data-week-row]")).not.toBeInTheDocument();
  });
});
