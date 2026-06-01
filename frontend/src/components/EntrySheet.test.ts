import { describe, it, expect, vi } from "vitest";
import { render, waitFor, fireEvent } from "@testing-library/svelte";
import EntrySheet from "./EntrySheet.svelte";
import type { CategoryMap, Entry } from "../lib/types";

const CATEGORIES: CategoryMap = {
  Food: ["Dining", "Groceries"],
  Salary: [],
};

function baseProps(overrides = {}) {
  return {
    open: true,
    categories: CATEGORIES,
    onclose: vi.fn(),
    onsave: vi.fn(),
    ...overrides,
  };
}

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 1,
    date: "2026-05-01",
    tag: "Dining",
    mainCategory: "Food",
    description: "Test",
    direction: "O",
    amount: 100,
    ...overrides,
  };
}

describe("EntrySheet — formula evaluation on blur", () => {
  it("resolves =10+5 to 15.00 on blur in the amount input", async () => {
    const { getByPlaceholderText } = render(
      EntrySheet,
      baseProps({ entry: makeEntry({ direction: "O", tag: "Dining" }) })
    );
    const input = getByPlaceholderText("0.00") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "=10+5" } });
    await fireEvent.blur(input);
    await waitFor(() => expect(input.value).toBe("15.00"));
  });

  it("resolves =100-SUM(30,20,15) to 35.00 on blur", async () => {
    const { getByPlaceholderText } = render(
      EntrySheet,
      baseProps({ entry: makeEntry({ direction: "O", tag: "Dining" }) })
    );
    const input = getByPlaceholderText("0.00") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "=100-SUM(30,20,15)" } });
    await fireEvent.blur(input);
    await waitFor(() => expect(input.value).toBe("35.00"));
  });

  it("keeps raw formula and shows inline error for =10+abc on blur", async () => {
    const { getByPlaceholderText, getByText } = render(
      EntrySheet,
      baseProps({ entry: makeEntry({ direction: "O", tag: "Dining" }) })
    );
    const input = getByPlaceholderText("0.00") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "=10+abc" } });
    await fireEvent.blur(input);
    await waitFor(() => {
      expect(input.value).toBe("=10+abc");
      expect(getByText("Invalid formula")).toBeInTheDocument();
    });
  });

  it("disables Save when the formula is invalid", async () => {
    const { getByPlaceholderText, getByRole } = render(
      EntrySheet,
      baseProps({ entry: makeEntry({ direction: "O", tag: "Dining" }) })
    );
    const input = getByPlaceholderText("0.00") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "=10+abc" } });
    await fireEvent.blur(input);
    await waitFor(() =>
      expect(getByRole("button", { name: /^Save$/ })).toBeDisabled()
    );
  });

  it("disables Save when formula resolves to a non-positive value", async () => {
    const { getByPlaceholderText, getByRole, getByText } = render(
      EntrySheet,
      baseProps({ entry: makeEntry({ direction: "O", tag: "Dining" }) })
    );
    const input = getByPlaceholderText("0.00") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "=5-10" } });
    await fireEvent.blur(input);
    await waitFor(() => {
      expect(getByRole("button", { name: /^Save$/ })).toBeDisabled();
      expect(getByText("Amount must be positive")).toBeInTheDocument();
    });
  });

  it("does not affect plain numeric input (no = prefix)", async () => {
    const { getByPlaceholderText } = render(
      EntrySheet,
      baseProps({ entry: makeEntry({ direction: "O", tag: "Dining" }) })
    );
    const input = getByPlaceholderText("0.00") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "50.00" } });
    await fireEvent.blur(input);
    await waitFor(() => expect(input.value).toBe("50.00"));
  });

  it("after valid formula resolves, clicking into the field shows the numeric value", async () => {
    const { getByPlaceholderText } = render(
      EntrySheet,
      baseProps({ entry: makeEntry({ direction: "O", tag: "Dining" }) })
    );
    const input = getByPlaceholderText("0.00") as HTMLInputElement;
    await fireEvent.input(input, { target: { value: "=10+5" } });
    await fireEvent.blur(input);
    await waitFor(() => expect(input.value).toBe("15.00"));
    // Focusing again should still show the resolved number, not the original formula
    await fireEvent.focus(input);
    expect(input.value).toBe("15.00");
  });
});

describe("EntrySheet — saveDisabled direction/tag validation", () => {
  it("Save enabled for valid Outgoing entry with subcategory tag", async () => {
    const { getByRole } = render(
      EntrySheet,
      baseProps({ entry: makeEntry({ direction: "O", tag: "Dining" }) })
    );
    await waitFor(() =>
      expect(getByRole("button", { name: /^Save$/ })).not.toBeDisabled()
    );
  });

  it("Save enabled for valid Incoming entry with category tag", async () => {
    const { getByRole } = render(
      EntrySheet,
      baseProps({ entry: makeEntry({ direction: "I", tag: "Food", mainCategory: "Food" }) })
    );
    await waitFor(() =>
      expect(getByRole("button", { name: /^Save$/ })).not.toBeDisabled()
    );
  });

  it("Save disabled when direction=Incoming but tag is a subcategory (mismatch)", async () => {
    // This is the silent-corruption scenario from issue #50:
    // entry stored with direction='I' but a subcategory tag ('Dining')
    const { getByRole } = render(
      EntrySheet,
      baseProps({ entry: makeEntry({ direction: "I", tag: "Dining", mainCategory: "Food" }) })
    );
    await waitFor(() =>
      expect(getByRole("button", { name: /^Save$/ })).toBeDisabled()
    );
  });

  it("Save disabled when tag is empty (regression guard)", async () => {
    const { getByRole } = render(
      EntrySheet,
      baseProps({ entry: makeEntry({ direction: "O", tag: "", amount: 100 }) })
    );
    await waitFor(() =>
      expect(getByRole("button", { name: /^Save$/ })).toBeDisabled()
    );
  });
});
