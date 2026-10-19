export interface CategorySyncChange {
  kind: "rename" | "delete";
  oldValue: string;
  newTag: string;
}

export interface CategoryEditEventData {
  sheetName: string;
  column: number;
  row: number;
  numRows: number;
  numCols: number;
  oldValue?: string;
  value?: string;
}

export type CategorySyncResult =
  | { status: "ignored" }
  | { status: "empty" }
  | { status: "blocked"; message: string }
  | { status: "declined"; count: number }
  | { status: "applied"; count: number }
  | { status: "interrupted"; count: number }
  | { status: "deferred"; count: number };

/**
 * Shared confirmation and recovery policy for edit and retry. The transaction
 * must acquire the shared document lock before invoking work. Once work begins,
 * any exception is an interruption: writes may have landed and are not rolled back.
 */
export function applyCategorySync(deps: {
  change: CategorySyncChange;
  count(oldTag: string): number;
  confirm(count: number): boolean;
  transact<T>(work: () => T): T;
  retag(oldTag: string, newTag: string): number;
  savePending(change: CategorySyncChange): void;
}): CategorySyncResult {
  const count = deps.count(deps.change.oldValue);
  if (!deps.confirm(count)) return { status: "declined", count };

  let started = false;
  try {
    const applied = deps.transact(() => {
      started = true;
      return deps.retag(deps.change.oldValue, deps.change.newTag);
    });
    return { status: "applied", count: applied };
  } catch {
    deps.savePending(deps.change);
    return { status: started ? "interrupted" : "deferred", count };
  }
}

/** Semantic catalog for the edited cell; coordinates and merged cells stay in adapters. */
export interface CategorySyncCatalog {
  parentCategory: string | null;
  categories: string[];
  otherSubcategories: { name: string; parent: string }[];
}

export interface CategorySyncPorts {
  count(oldTag: string): number;
  confirm(change: CategorySyncChange, count: number, retry: boolean): boolean;
  transact<T>(work: () => T): T;
  retag(oldTag: string, newTag: string): number;
  savePending(change: CategorySyncChange): void;
}

export function runCategorySync(deps: CategorySyncPorts & {
  edit: { isSubcategoryCell: boolean; oldValue?: string; value?: string };
  getCatalog(): CategorySyncCatalog;
}): CategorySyncResult {
  const classification = classifyCategoryChange(deps.edit);
  if (classification.kind === "ignore") return { status: "ignored" };
  const oldValue = classification.oldValue;
  const value = classification.kind === "rename" ? classification.newValue : "";
  const catalog = deps.getCatalog();
  const collision = value ? categoryNameCollision(value, catalog) : null;
  if (collision) return { status: "blocked", message: collision.message };
  if (!value && !catalog.parentCategory) {
    return { status: "blocked", message: "Cannot sync deletion without a parent Category." };
  }
  const change: CategorySyncChange = {
    kind: value ? "rename" : "delete",
    oldValue,
    newTag: value || catalog.parentCategory!,
  };
  return applyCategorySync({
    ...deps,
    change,
    confirm: (count) => deps.confirm(change, count, false),
  });
}

export function retryCategorySync(deps: CategorySyncPorts & {
  pending: CategorySyncChange | null;
  clearPending(): void;
}): CategorySyncResult {
  const change = deps.pending;
  if (!change) return { status: "empty" };
  const result = applyCategorySync({
    ...deps,
    change,
    confirm: (count) => deps.confirm(change, count, true),
  });
  if (result.status === "applied") deps.clearPending();
  return result;
}

export type CategoryChangeClassification =
  | { kind: "ignore" }
  | { kind: "rename"; oldValue: string; newValue: string }
  | { kind: "delete"; oldValue: string };

export function classifyCategoryChange(edit: {
  isSubcategoryCell: boolean; oldValue?: string; value?: string;
}): CategoryChangeClassification {
  const oldValue = (edit.oldValue ?? "").trim();
  const value = (edit.value ?? "").trim();
  if (!edit.isSubcategoryCell || !oldValue || oldValue === value) return { kind: "ignore" };
  return value ? { kind: "rename", oldValue, newValue: value } : { kind: "delete", oldValue };
}

export function categoryNameCollision(newName: string, catalog: CategorySyncCatalog): { message: string } | null {
  if (catalog.categories.includes(newName)) {
    return { message: `'${newName}' already exists as a top-level Category — rename aborted` };
  }
  const collision = catalog.otherSubcategories.find((item) => item.name === newName);
  return collision ? { message: `'${newName}' already exists under ${collision.parent} — rename aborted` } : null;
}
