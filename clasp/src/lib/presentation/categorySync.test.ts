import { expect, it, vi } from "vitest";
import { handleCategorySyncEdit } from "./categorySync";

it("translates a Sheets edit event into application-facing values", () => {
  const apply = vi.fn();
  const range = {
    getSheet: () => ({ getName: () => "Categories" }),
    getColumn: () => 2,
    getRow: () => 7,
    getNumRows: () => 1,
    getNumColumns: () => 1,
  };

  handleCategorySyncEdit({ range, oldValue: "Dining", value: "Eating out" }, apply);

  expect(apply).toHaveBeenCalledWith({
    sheetName: "Categories",
    column: 2,
    row: 7,
    numRows: 1,
    numCols: 1,
    oldValue: "Dining",
    value: "Eating out",
  });
});
