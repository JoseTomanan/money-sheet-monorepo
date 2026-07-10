import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildMenu } from "./menu";

describe("buildMenu", () => {
  const mockAddToUi = vi.fn();
  const mockAddItem = vi.fn();
  const mockAddSeparator = vi.fn();
  const mockCreateMenu = vi.fn();

  beforeEach(() => {
    mockAddToUi.mockReset();
    mockAddSeparator.mockReset().mockReturnValue({ addItem: mockAddItem, addToUi: mockAddToUi });
    mockAddItem.mockReset().mockReturnValue({ addItem: mockAddItem, addSeparator: mockAddSeparator, addToUi: mockAddToUi });
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

  it("calls addToUi to attach each menu to the spreadsheet", () => {
    buildMenu(makeUi());
    expect(mockAddToUi).toHaveBeenCalledTimes(2); // "Autohide" and "Categories"
  });

  it("calls addSeparator once to separate autohide items from setup", () => {
    buildMenu(makeUi());
    expect(mockAddSeparator).toHaveBeenCalledOnce();
  });

  it('adds "Run setup" item wired to the setup function', () => {
    buildMenu(makeUi());
    expect(mockAddItem).toHaveBeenCalledWith("Run setup", "setup");
  });

  it('creates a second menu named "Categories", separate from "Autohide"', () => {
    buildMenu(makeUi());
    expect(mockCreateMenu).toHaveBeenCalledWith("Autohide");
    expect(mockCreateMenu).toHaveBeenCalledWith("Categories");
  });

  it('adds "Install category-sync trigger" item wired to installCategorySyncTrigger', () => {
    buildMenu(makeUi());
    expect(mockAddItem).toHaveBeenCalledWith(
      "Install category-sync trigger",
      "installCategorySyncTrigger"
    );
  });

  it('adds "Retry last category sync" item wired to retryLastCategorySync', () => {
    buildMenu(makeUi());
    expect(mockAddItem).toHaveBeenCalledWith(
      "Retry last category sync",
      "retryLastCategorySync"
    );
  });
});
