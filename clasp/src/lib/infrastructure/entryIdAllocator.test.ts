import { describe, expect, it } from "vitest";
import { reserveEntryIdBlock } from "./entryIdAllocator";

function makeMemoryProps(initial: Record<string, string>) {
  const values = { ...initial };
  return {
    values,
    props: {
      getProperty: (key: string) => values[key] ?? null,
      setProperties: (properties: Record<string, string>) => {
        Object.assign(values, properties);
      },
    } as unknown as GoogleAppsScript.Properties.Properties,
  };
}

describe("reserveEntryIdBlock", () => {
  it("allocates above the high-water mark after the current maximum Entry is deleted", () => {
    const { props, values } = makeMemoryProps({
      ENTRY_ID_HIGH_WATER: "2",
      ENTRY_ID_SPREADSHEET_ID: "spreadsheet-1",
    });

    const firstId = reserveEntryIdBlock(props, "spreadsheet-1", [1], 1);

    expect(firstId).toBe(3);
    expect(values.ENTRY_ID_HIGH_WATER).toBe("3");
  });

  it("allocates above the high-water mark after every Entry is deleted", () => {
    const { props } = makeMemoryProps({
      ENTRY_ID_HIGH_WATER: "12",
      ENTRY_ID_SPREADSHEET_ID: "spreadsheet-1",
    });

    expect(reserveEntryIdBlock(props, "spreadsheet-1", [], 1)).toBe(13);
  });

  it("migrates an existing spreadsheet from the maximum Entry ID still present", () => {
    const { props, values } = makeMemoryProps({});

    expect(reserveEntryIdBlock(props, "legacy-spreadsheet", [2, 9, 4], 1)).toBe(10);
    expect(values).toEqual({
      ENTRY_ID_HIGH_WATER: "10",
      ENTRY_ID_SPREADSHEET_ID: "legacy-spreadsheet",
    });
  });

  it("rebinds a copied spreadsheet without inheriting the source allocator state", () => {
    const { props, values } = makeMemoryProps({
      ENTRY_ID_HIGH_WATER: "500",
      ENTRY_ID_SPREADSHEET_ID: "source-template",
    });

    expect(reserveEntryIdBlock(props, "spreadsheet-copy", [3, 7], 1)).toBe(8);
    expect(values).toEqual({
      ENTRY_ID_HIGH_WATER: "8",
      ENTRY_ID_SPREADSHEET_ID: "spreadsheet-copy",
    });
  });

  it("reserves one contiguous block for an atomic batch", () => {
    const { props, values } = makeMemoryProps({
      ENTRY_ID_HIGH_WATER: "20",
      ENTRY_ID_SPREADSHEET_ID: "spreadsheet-1",
    });

    expect(reserveEntryIdBlock(props, "spreadsheet-1", [18, 19], 3)).toBe(21);
    expect(values.ENTRY_ID_HIGH_WATER).toBe("23");
  });

  it("repairs stale allocator state from a higher Entry ID in the sheet", () => {
    const { props, values } = makeMemoryProps({
      ENTRY_ID_HIGH_WATER: "4",
      ENTRY_ID_SPREADSHEET_ID: "spreadsheet-1",
    });

    expect(reserveEntryIdBlock(props, "spreadsheet-1", [9], 1)).toBe(10);
    expect(values.ENTRY_ID_HIGH_WATER).toBe("10");
  });
});
