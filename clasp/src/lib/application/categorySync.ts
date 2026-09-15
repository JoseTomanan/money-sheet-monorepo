export interface CategorySyncChange {
  kind: "rename" | "delete";
  oldValue: string;
  newTag: string;
}

export type CategorySyncResult =
  | { status: "declined"; count: number }
  | { status: "applied"; count: number }
  | { status: "deferred"; count: number };

/**
 * Confirm and apply one already-planned Category synchronization. The caller
 * translates UI and supplies the shared transaction policy; the repository
 * operations stay semantic and contain no Google Sheets details.
 */
export function applyCategorySync(deps: {
  change: CategorySyncChange;
  count(oldTag: string): number;
  confirm(count: number): boolean;
  transact<T>(work: () => T): T;
  retag(oldTag: string, newTag: string): number;
  onLockFailure(change: CategorySyncChange): void;
}): CategorySyncResult {
  const count = deps.count(deps.change.oldValue);
  if (!deps.confirm(count)) return { status: "declined", count };

  try {
    const applied = deps.transact(() =>
      deps.retag(deps.change.oldValue, deps.change.newTag)
    );
    return { status: "applied", count: applied };
  } catch {
    deps.onLockFailure(deps.change);
    return { status: "deferred", count };
  }
}
