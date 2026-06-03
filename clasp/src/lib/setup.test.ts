import { describe, it, expect, vi, beforeEach } from "vitest";
import { runSetup } from "./setup";

const mockSetProperty = vi.fn();
const mockGetProperty = vi.fn();
const mockAlert = vi.fn();

const Button = { YES: "YES", NO: "NO" } as any;
const ButtonSet = { YES_NO: "YES_NO" } as any;

function makeProps(existingSecret: string | null = null) {
  mockGetProperty.mockReturnValue(existingSecret);
  return {
    setProperty: mockSetProperty,
    getProperty: mockGetProperty,
  } as unknown as GoogleAppsScript.Properties.Properties;
}
function makeUi() {
  return { alert: mockAlert, Button, ButtonSet } as unknown as GoogleAppsScript.Base.Ui;
}
const fakeSecret = () => "test-uuid-1234";

beforeEach(() => {
  mockSetProperty.mockReset();
  mockGetProperty.mockReset();
  mockAlert.mockReset();
});

describe("runSetup", () => {
  it("stores the generated secret as API_SECRET in Script Properties", () => {
    runSetup(makeProps(), makeUi(), fakeSecret);
    expect(mockSetProperty).toHaveBeenCalledWith("API_SECRET", "test-uuid-1234");
  });

  it("shows the generated secret to the user via ui.alert()", () => {
    runSetup(makeProps(), makeUi(), fakeSecret);
    expect(mockAlert).toHaveBeenCalledWith("test-uuid-1234");
  });

  it("the secret shown in the alert is the same value stored in properties", () => {
    let counter = 0;
    const countingSecret = () => `secret-${++counter}`;
    runSetup(makeProps(), makeUi(), countingSecret);
    const stored = mockSetProperty.mock.calls[0][1];
    const shown = mockAlert.mock.calls[0][0];
    expect(shown).toBe(stored);
  });

  it("when no API_SECRET exists, proceeds without a confirmation dialog", () => {
    runSetup(makeProps(null), makeUi(), fakeSecret);
    expect(mockAlert).toHaveBeenCalledOnce();
    expect(mockAlert).toHaveBeenCalledWith("test-uuid-1234");
  });

  it("when API_SECRET already exists, shows a YES/NO confirmation before proceeding", () => {
    mockAlert.mockReturnValueOnce(Button.YES);
    runSetup(makeProps("existing-secret"), makeUi(), fakeSecret);
    expect(mockAlert).toHaveBeenCalledWith(
      expect.stringContaining("already exists"),
      ButtonSet.YES_NO
    );
  });

  it("when API_SECRET exists and user clicks NO, does not overwrite the secret", () => {
    mockAlert.mockReturnValueOnce(Button.NO);
    runSetup(makeProps("existing-secret"), makeUi(), fakeSecret);
    expect(mockSetProperty).not.toHaveBeenCalled();
  });

  it("when API_SECRET exists and user clicks YES, overwrites with the new secret", () => {
    mockAlert.mockReturnValueOnce(Button.YES);
    runSetup(makeProps("existing-secret"), makeUi(), fakeSecret);
    expect(mockSetProperty).toHaveBeenCalledWith("API_SECRET", "test-uuid-1234");
  });
});
