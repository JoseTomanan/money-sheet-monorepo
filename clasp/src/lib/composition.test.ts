import { afterEach, describe, expect, it, vi } from "vitest";
import { compositionOnOpen } from "./composition";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("compositionOnOpen", () => {
  it("provisions a word-based secret through the production composition", () => {
    const values: Record<string, string> = {};
    const props = {
      getProperty: (key: string) => values[key] ?? null,
      setProperty: (key: string, value: string) => {
        values[key] = value;
      },
      setProperties: (properties: Record<string, string>) => {
        Object.assign(values, properties);
      },
    };
    const menu = {
      addItem: vi.fn(() => menu),
      addToUi: vi.fn(),
    };
    const ui = {
      createMenu: vi.fn(() => menu),
    };
    vi.stubGlobal("PropertiesService", {
      getScriptProperties: () => props,
    });
    vi.stubGlobal("SpreadsheetApp", {
      getUi: () => ui,
    });
    vi.stubGlobal("Utilities", {
      getUuid: () => "uuid-secret",
    });
    vi.spyOn(Math, "random").mockReturnValue(0);

    compositionOnOpen({
      source: { getId: () => "spreadsheet-copy" },
    } as GoogleAppsScript.Events.SheetsOnOpen);

    expect(values.API_SECRET).toBe("AbleAbleAbleAcorn");
  });
});
