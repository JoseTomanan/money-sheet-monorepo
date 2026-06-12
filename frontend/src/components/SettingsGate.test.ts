import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/svelte";
import SettingsGate from "./SettingsGate.svelte";

const mockSetConnection = vi.hoisted(() => vi.fn());
const mockConnection = vi.hoisted(() => ({
  current: null as { gasUrl: string; apiSecret: string } | null,
}));
const mockValidateConnection = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../lib/connection.svelte", () => ({
  connection: mockConnection,
  setConnection: mockSetConnection,
}));

vi.mock("../lib/api", () => ({
  validateConnection: mockValidateConnection,
  UnauthorizedError: class UnauthorizedError extends Error {},
  ConnectionError: class ConnectionError extends Error {},
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

  it("renders a link to the Google Sheet template", () => {
    const { getByRole } = render(SettingsGate, { onsaved: vi.fn() });
    const link = getByRole("link", { name: /copy the template/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("docs.google.com/spreadsheets"));
  });

  it("renders instructions mentioning the Autohide menu and Run setup item", () => {
    const { getByText } = render(SettingsGate, { onsaved: vi.fn() });
    expect(getByText(/autohide/i)).toBeInTheDocument();
    expect(getByText(/run setup/i)).toBeInTheDocument();
  });

  it("renders instructions mentioning deploying as a web app", () => {
    const { getByText } = render(SettingsGate, { onsaved: vi.fn() });
    expect(getByText(/web app/i)).toBeInTheDocument();
  });

  it("renders 4 numbered setup steps", () => {
    const { container } = render(SettingsGate, { onsaved: vi.fn() });
    const items = container.querySelectorAll("ol li");
    expect(items).toHaveLength(4);
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
    await fireEvent.click(getByRole("button", { name: /save|checking/i }));
    await waitFor(() => expect(onsaved).toHaveBeenCalledOnce());
  });
});
