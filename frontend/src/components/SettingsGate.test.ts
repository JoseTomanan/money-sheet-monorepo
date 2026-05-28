import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/svelte";
import SettingsGate from "./SettingsGate.svelte";

const mockSetConnection = vi.hoisted(() => vi.fn());
const mockConnection = vi.hoisted(() => ({
  current: null as { gasUrl: string; apiSecret: string } | null,
}));

vi.mock("../lib/connection.svelte", () => ({
  connection: mockConnection,
  setConnection: mockSetConnection,
}));

describe("SettingsGate", () => {
  beforeEach(() => {
    mockSetConnection.mockClear();
    mockConnection.current = null;
  });

  it("renders GAS URL and API Secret inputs", () => {
    const { getByLabelText } = render(SettingsGate, { onsaved: vi.fn() });
    expect(getByLabelText(/GAS URL/i)).toBeInTheDocument();
    expect(getByLabelText(/API Secret/i)).toBeInTheDocument();
  });

  it("renders no close, cancel, dismiss, or done button", () => {
    const { queryAllByRole } = render(SettingsGate, { onsaved: vi.fn() });
    const buttons = queryAllByRole("button");
    const closePattern = /^(close|cancel|dismiss|done)$/i;
    const hasClose = buttons.some((b) => {
      const label = b.getAttribute("aria-label") ?? b.textContent ?? "";
      return closePattern.test(label.trim());
    });
    expect(hasClose).toBe(false);
  });

  it("fires onsaved when both fields are filled and Save is clicked", async () => {
    const onsaved = vi.fn();
    const { getByLabelText, getByRole } = render(SettingsGate, { onsaved });
    await fireEvent.input(getByLabelText(/GAS URL/i), {
      target: { value: "https://fake.example" },
    });
    await fireEvent.input(getByLabelText(/API Secret/i), {
      target: { value: "secret" },
    });
    await fireEvent.click(getByRole("button", { name: /save/i }));
    expect(onsaved).toHaveBeenCalledOnce();
  });
});
