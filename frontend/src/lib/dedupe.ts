import type { Entry } from "./types";

export function dedupeEntries(entries: Entry[]): Entry[] {
  const seen = new Set<number>();
  const dupes: number[] = [];
  const result: Entry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.id)) {
      dupes.push(entry.id);
    } else {
      seen.add(entry.id);
      result.push(entry);
    }
  }
  if (dupes.length > 0) {
    console.warn(`[money-sheet] Duplicate entry IDs dropped: ${[...new Set(dupes)].join(", ")}. Clean up these rows in your spreadsheet.`);
  }
  return result;
}
