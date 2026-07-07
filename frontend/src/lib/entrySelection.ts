export function entryCountLabel(n: number): string {
  return `${n} ${n === 1 ? 'entry' : 'entries'}`;
}

export type RowIntent = 'toggle' | 'edit' | 'none';

/** What a click/tap on an entry row should do, given select mode and the row's in-flight state. */
export function rowIntent(
  selectMode: boolean,
  selectable: boolean,
  pending: boolean,
  deletePending: boolean
): RowIntent {
  if (selectMode) return selectable ? 'toggle' : 'none';
  return !pending && !deletePending ? 'edit' : 'none';
}
