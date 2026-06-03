import { describe, it, expect, vi, beforeEach } from "vitest";
import { runSetup } from "./setup";

const mockSetProperty = vi.fn();
const mockAlert = vi.fn();

function makeProps() {
  return { setProperty: mockSetProperty } as unknown as GoogleAppsScript.Properties.Properties;
}
function makeUi() {
  return { alert: mockAlert } as unknown as GoogleAppsScript.Base.Ui;
}
const fakeSecret = () => "test-uuid-1234";

beforeEach(() => {
  mockSetProperty.mockReset();
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
});
