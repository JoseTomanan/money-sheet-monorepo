import { afterEach, describe, expect, it, vi } from "vitest";
import {
  rotateConnectionSecret,
  showConnectionDetails,
} from "./connectionUi";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("showConnectionDetails", () => {
  it("provisions the shared word-based secret when properties are missing", () => {
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
    const output = {
      setWidth: vi.fn(() => output),
      setHeight: vi.fn(() => output),
    };
    const ui = {
      showModalDialog: vi.fn(),
    };
    vi.stubGlobal("PropertiesService", {
      getScriptProperties: () => props,
    });
    vi.stubGlobal("SpreadsheetApp", {
      getActiveSpreadsheet: () => ({ getId: () => "spreadsheet-copy" }),
      getUi: () => ui,
    });
    vi.stubGlobal("HtmlService", {
      createHtmlOutput: vi.fn(() => output),
    });
    vi.stubGlobal("Utilities", {
      getUuid: () => "uuid-secret",
    });
    vi.spyOn(Math, "random").mockReturnValue(0);

    showConnectionDetails();

    expect(values.API_SECRET).toBe("AbleAbleAbleAcorn");
  });
});

describe("rotateConnectionSecret", () => {
  it("rotates through the shared word-based generator", () => {
    const values: Record<string, string> = {
      API_SECRET: "existing-secret",
      API_SECRET_SPREADSHEET_ID: "spreadsheet-copy",
    };
    const props = {
      getProperty: (key: string) => values[key] ?? null,
      setProperty: (key: string, value: string) => {
        values[key] = value;
      },
      setProperties: (properties: Record<string, string>) => {
        Object.assign(values, properties);
      },
    };
    const output = {
      setWidth: vi.fn(() => output),
      setHeight: vi.fn(() => output),
    };
    const Button = { YES: "YES" };
    const ui = {
      Button,
      ButtonSet: { YES_NO: "YES_NO" },
      alert: vi.fn(() => Button.YES),
      showModalDialog: vi.fn(),
    };
    vi.stubGlobal("PropertiesService", {
      getScriptProperties: () => props,
    });
    vi.stubGlobal("SpreadsheetApp", {
      getActiveSpreadsheet: () => ({ getId: () => "spreadsheet-copy" }),
      getUi: () => ui,
    });
    vi.stubGlobal("HtmlService", {
      createHtmlOutput: vi.fn(() => output),
    });
    vi.stubGlobal("Utilities", {
      getUuid: () => "uuid-secret",
    });
    vi.spyOn(Math, "random").mockReturnValue(0);

    rotateConnectionSecret();

    expect(values.API_SECRET).toBe("AbleAbleAbleAcorn");
  });
});
