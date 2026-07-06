import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/svelte";
import Settings from "./Settings.svelte";
import { ConnectionError, UnauthorizedError } from "../../lib/adapter-real";

const mockSetConnection = vi.hoisted(() => vi.fn());
const mockConnection = vi.hoisted(() => ({ current: null as { gasUrl: string; apiSecret: string } | null }));
const mockValidateConnection = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../../lib/connection.svelte", () => ({
  connection: mockConnection,
  setConnection: mockSetConnection,
}));

// Settings delegates error → copy mapping to the adapter's real userMessage —
// only validateConnection itself is mocked here.
vi.mock("../../lib/api", async () => {
  const real = await vi.importActual<typeof import("../../lib/adapter-real")>("../../lib/adapter-real");
  return {
    validateConnection: mockValidateConnection,
    userMessage: real.userMessage,
  };
});

function baseProps(overrides: Record<string, unknown> = {}) {
  return { onsaved: vi.fn(), ...overrides };
}

describe("Settings form", () => {
  beforeEach(() => {
    mockSetConnection.mockClear();
    mockConnection.current = null;
  });

  it("renders a GAS URL input and an API secret input", () => {
    const { getByLabelText } = render(Settings, baseProps());
    expect(getByLabelText(/GAS URL/i)).toBeInTheDocument();
    expect(getByLabelText(/API Secret/i)).toBeInTheDocument();
  });

  it("API secret input is masked (type=password) by default", () => {
    const { getByLabelText } = render(Settings, baseProps());
    expect(getByLabelText(/API Secret/i)).toHaveAttribute("type", "password");
  });

  it("show/hide toggle switches secret input to type=text", async () => {
    const { getByLabelText, getByRole } = render(Settings, baseProps());
    const toggle = getByRole("button", { name: /show|hide/i });
    await fireEvent.click(toggle);
    expect(getByLabelText(/API Secret/i)).toHaveAttribute("type", "text");
  });

  it("show/hide toggle switches back to type=password on second click", async () => {
    const { getByLabelText, getByRole } = render(Settings, baseProps());
    const toggle = getByRole("button", { name: /show|hide/i });
    await fireEvent.click(toggle);
    await fireEvent.click(toggle);
    expect(getByLabelText(/API Secret/i)).toHaveAttribute("type", "password");
  });

  it("Save button is disabled when both fields are empty", () => {
    const { getByRole } = render(Settings, baseProps());
    expect(getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("Save button is disabled when only GAS URL is filled", async () => {
    const { getByLabelText, getByRole } = render(Settings, baseProps());
    await fireEvent.input(getByLabelText(/GAS URL/i), { target: { value: "https://fake.example" } });
    expect(getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("Save button is disabled when only API Secret is filled", async () => {
    const { getByLabelText, getByRole } = render(Settings, baseProps());
    await fireEvent.input(getByLabelText(/API Secret/i), { target: { value: "secret" } });
    expect(getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("Save button is enabled when both fields are non-empty", async () => {
    const { getByLabelText, getByRole } = render(Settings, baseProps());
    await fireEvent.input(getByLabelText(/GAS URL/i), { target: { value: "https://fake.example" } });
    await fireEvent.input(getByLabelText(/API Secret/i), { target: { value: "secret" } });
    expect(getByRole("button", { name: /save/i })).not.toBeDisabled();
  });

  it("clicking Save calls setConnection with trimmed values", async () => {
    const onsaved = vi.fn();
    const { getByLabelText, getByRole } = render(Settings, baseProps({ onsaved }));
    await fireEvent.input(getByLabelText(/GAS URL/i), { target: { value: "  https://fake.example  " } });
    await fireEvent.input(getByLabelText(/API Secret/i), { target: { value: "  my-secret  " } });
    await fireEvent.click(getByRole("button", { name: /save/i }));
    expect(mockSetConnection).toHaveBeenCalledWith({
      gasUrl: "https://fake.example",
      apiSecret: "my-secret",
    });
  });

  it("clicking Save fires the onsaved callback", async () => {
    const onsaved = vi.fn();
    const { getByLabelText, getByRole } = render(Settings, baseProps({ onsaved }));
    await fireEvent.input(getByLabelText(/GAS URL/i), { target: { value: "https://fake.example" } });
    await fireEvent.input(getByLabelText(/API Secret/i), { target: { value: "secret" } });
    await fireEvent.click(getByRole("button", { name: /save|checking/i }));
    await waitFor(() => expect(onsaved).toHaveBeenCalledOnce());
  });

  it("prefills inputs from connection.current when set", () => {
    mockConnection.current = { gasUrl: "https://existing.url", apiSecret: "existing-secret" };
    const { getByLabelText } = render(Settings, baseProps());
    expect(getByLabelText(/GAS URL/i)).toHaveValue("https://existing.url");
    expect(getByLabelText(/API Secret/i)).toHaveValue("existing-secret");
  });

  // ── Cycle 6: error copy is sourced from the adapter's userMessage, not
  // re-mapped locally via instanceof ────────────────────────────────────────
  describe("error messaging (sourced from adapter userMessage)", () => {
    async function attemptSave() {
      const { getByLabelText, getByRole, findByText } = render(Settings, baseProps());
      await fireEvent.input(getByLabelText(/GAS URL/i), { target: { value: "https://fake.example" } });
      await fireEvent.input(getByLabelText(/API Secret/i), { target: { value: "secret" } });
      await fireEvent.click(getByRole("button", { name: /save/i }));
      return { findByText };
    }

    it("shows the auth-rejected message when validateConnection rejects with UnauthorizedError", async () => {
      mockValidateConnection.mockRejectedValueOnce(new UnauthorizedError("nope"));
      const { findByText } = await attemptSave();
      await findByText(/Secret rejected — make sure the secret and the GAS URL are from the same copy of the sheet\./);
    });

    it("shows the unreachable-URL message when validateConnection rejects with ConnectionError", async () => {
      mockValidateConnection.mockRejectedValueOnce(new ConnectionError("offline"));
      const { findByText } = await attemptSave();
      await findByText(/Couldn't reach that URL — check the GAS web-app URL and try again\./);
    });

    it("shows the generic fallback when validateConnection rejects with a plain Error", async () => {
      mockValidateConnection.mockRejectedValueOnce(new Error("boom"));
      const { findByText } = await attemptSave();
      await findByText(/Something went wrong\. Check the URL and secret and try again\./);
    });
  });
});
