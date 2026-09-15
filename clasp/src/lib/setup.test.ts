import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  bootstrapApiSecret,
  buildConnectionDetailsHtml,
  rotateApiSecret,
} from "./infrastructure/setup";

const mockAlert = vi.fn();

const Button = { YES: "YES", NO: "NO" } as any;
const ButtonSet = { YES_NO: "YES_NO" } as any;

function makeUi() {
  return { alert: mockAlert, Button, ButtonSet } as unknown as GoogleAppsScript.Base.Ui;
}
const fakeSecret = () => "test-uuid-1234";

function makeMemoryProps(initial: Record<string, string> = {}) {
  const values = { ...initial };
  return {
    values,
    props: {
      getProperty: (key: string) => values[key] ?? null,
      setProperty: (key: string, value: string) => {
        values[key] = value;
      },
      setProperties: (properties: Record<string, string>) => {
        Object.assign(values, properties);
      },
    } as unknown as GoogleAppsScript.Properties.Properties,
  };
}

beforeEach(() => {
  mockAlert.mockReset();
});

describe("bootstrapApiSecret", () => {
  it("provisions an API secret when a spreadsheet has no bootstrap properties", () => {
    const { props, values } = makeMemoryProps();

    const secret = bootstrapApiSecret(props, "spreadsheet-copy", fakeSecret);

    expect(secret).toBe("test-uuid-1234");
    expect(values).toEqual({
      API_SECRET: "test-uuid-1234",
      API_SECRET_SPREADSHEET_ID: "spreadsheet-copy",
    });
  });

  it("keeps the existing secret when the same spreadsheet is reopened", () => {
    const { props } = makeMemoryProps({
      API_SECRET: "existing-secret",
      API_SECRET_SPREADSHEET_ID: "same-spreadsheet",
    });
    const generateSecret = vi.fn(() => "replacement-secret");

    const secret = bootstrapApiSecret(props, "same-spreadsheet", generateSecret);

    expect(secret).toBe("existing-secret");
    expect(generateSecret).not.toHaveBeenCalled();
  });

  it("replaces an inherited secret when a copied spreadsheet has a new identity", () => {
    const { props, values } = makeMemoryProps({
      API_SECRET: "source-template-secret",
      API_SECRET_SPREADSHEET_ID: "source-template",
    });

    const secret = bootstrapApiSecret(props, "spreadsheet-copy", fakeSecret);

    expect(secret).toBe("test-uuid-1234");
    expect(values).toEqual({
      API_SECRET: "test-uuid-1234",
      API_SECRET_SPREADSHEET_ID: "spreadsheet-copy",
    });
  });

  it("adopts a legacy secret that predates spreadsheet identity metadata", () => {
    const { props, values } = makeMemoryProps({ API_SECRET: "legacy-secret" });
    const generateSecret = vi.fn(() => "replacement-secret");

    const secret = bootstrapApiSecret(props, "legacy-spreadsheet", generateSecret);

    expect(secret).toBe("legacy-secret");
    expect(values.API_SECRET_SPREADSHEET_ID).toBe("legacy-spreadsheet");
    expect(generateSecret).not.toHaveBeenCalled();
  });

  it("repairs partial properties when the stored secret is empty", () => {
    const { props, values } = makeMemoryProps({
      API_SECRET: "",
      API_SECRET_SPREADSHEET_ID: "same-spreadsheet",
    });

    const secret = bootstrapApiSecret(props, "same-spreadsheet", fakeSecret);

    expect(secret).toBe("test-uuid-1234");
    expect(values.API_SECRET).toBe("test-uuid-1234");
  });

  it("repairs partial properties when only the spreadsheet identity remains", () => {
    const { props, values } = makeMemoryProps({
      API_SECRET_SPREADSHEET_ID: "same-spreadsheet",
    });

    bootstrapApiSecret(props, "same-spreadsheet", fakeSecret);

    expect(values.API_SECRET).toBe("test-uuid-1234");
  });
});

describe("rotateApiSecret", () => {
  it("deliberately replaces the secret while preserving its spreadsheet binding", () => {
    const { props, values } = makeMemoryProps({
      API_SECRET: "existing-secret",
      API_SECRET_SPREADSHEET_ID: "spreadsheet-copy",
    });
    mockAlert.mockReturnValueOnce(Button.YES);

    const secret = rotateApiSecret(
      props,
      makeUi(),
      "spreadsheet-copy",
      fakeSecret
    );

    expect(secret).toBe("test-uuid-1234");
    expect(values).toEqual({
      API_SECRET: "test-uuid-1234",
      API_SECRET_SPREADSHEET_ID: "spreadsheet-copy",
    });
  });

  it("leaves the existing secret unchanged when rotation is cancelled", () => {
    const { props, values } = makeMemoryProps({
      API_SECRET: "existing-secret",
      API_SECRET_SPREADSHEET_ID: "spreadsheet-copy",
    });
    mockAlert.mockReturnValueOnce(Button.NO);

    const secret = rotateApiSecret(
      props,
      makeUi(),
      "spreadsheet-copy",
      fakeSecret
    );

    expect(secret).toBeNull();
    expect(values.API_SECRET).toBe("existing-secret");
  });
});

describe("buildConnectionDetailsHtml", () => {
  it("renders the API secret in a selectable field with a copy action", () => {
    const html = buildConnectionDetailsHtml("test-uuid-1234");

    expect(html).toContain('value="test-uuid-1234"');
    expect(html).toContain("readonly");
    expect(html).toContain("navigator.clipboard.writeText");
    expect(html).toContain("Copy secret");
  });

  it("escapes an opaque secret before placing it in HTML", () => {
    const html = buildConnectionDetailsHtml('words & "symbols"');

    expect(html).toContain('value="words &amp; &quot;symbols&quot;"');
    expect(html).not.toContain('value="words & "symbols""');
  });
});
