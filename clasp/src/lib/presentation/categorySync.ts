import type { CategoryEditEventData } from "../application/categorySync";

interface EditRange {
  getSheet(): { getName(): string };
  getColumn(): number;
  getRow(): number;
  getNumRows(): number;
  getNumColumns(): number;
}

interface CategorySyncEditEvent {
  range: EditRange;
  oldValue?: string;
  value?: string;
}

export function handleCategorySyncEdit(
  event: CategorySyncEditEvent,
  apply: (edit: CategoryEditEventData) => void,
): void {
  const range = event.range;
  apply({
    sheetName: range.getSheet().getName(),
    column: range.getColumn(),
    row: range.getRow(),
    numRows: range.getNumRows(),
    numCols: range.getNumColumns(),
    oldValue: event.oldValue,
    value: event.value,
  });
}
