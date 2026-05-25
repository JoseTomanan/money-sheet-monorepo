import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildMenu } from "./menu";

describe("buildMenu", () => {
  const mockAddToUi = vi.fn();
  const mockAddItem = vi.fn();
  const mockCreateMenu = vi.fn();

  beforeEach(() => {
    mockAddToUi.mockReset();
    mockAddItem.mockReset().mockReturnValue({ addItem: mockAddItem, addToUi: mockAddToUi });
    mockCreateMenu.mockReset().mockReturnValue({ addItem: mockAddItem });
  });

  const makeUi = () =>
    ({ createMenu: mockCreateMenu }) as unknown as GoogleAppsScript.Base.Ui;

  it('creates a menu named "Autohide"', () => {
    buildMenu(makeUi());
    expect(mockCreateMenu).toHaveBeenCalledWith("Autohide");
  });

  it('adds "Run autohide now" item wired to applyRowVisibilityForActiveSheet', () => {
    buildMenu(makeUi());
    expect(mockAddItem).toHaveBeenCalledWith(
      "Run autohide now",
      "applyRowVisibilityForActiveSheet"
    );
  });

  it('adds "Install weekly trigger" item wired to installWeeklyVisibilityTrigger', () => {
    buildMenu(makeUi());
    expect(mockAddItem).toHaveBeenCalledWith(
      "Install weekly trigger",
      "installWeeklyVisibilityTrigger"
    );
  });

  it("calls addToUi to attach the menu to the spreadsheet", () => {
    buildMenu(makeUi());
    expect(mockAddToUi).toHaveBeenCalledOnce();
  });
});
