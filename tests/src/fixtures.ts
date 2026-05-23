import type { AddEntryPayload, CategoryMap, Entry, GasClient } from "./client";

export function runId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function markerDescription(run: string, label = ""): string {
  return `__TEST__${run}__${label}`;
}

/**
 * Flatten a CategoryMap into a list of unique subcategories with their parent.
 * Used by tests to pick valid tags without hard-coding sheet contents.
 */
export function flattenSubcats(
  cats: CategoryMap,
): Array<{ category: string; subcategory: string }> {
  const out: Array<{ category: string; subcategory: string }> = [];
  for (const [category, subs] of Object.entries(cats)) {
    for (const sub of subs) out.push({ category, subcategory: sub });
  }
  return out;
}

export function pickSubcategories(
  cats: CategoryMap,
  n: number,
): Array<{ category: string; subcategory: string }> {
  const all = flattenSubcats(cats);
  if (all.length < n) {
    throw new Error(
      `Need ${n} distinct subcategories, sheet only has ${all.length}`,
    );
  }
  return all.slice(0, n);
}

/**
 * addEntry wrapper that records the returned id so afterEach can clean up.
 * Use this for every legitimate insert in a test.
 */
export async function trackedAdd(
  client: GasClient,
  payload: AddEntryPayload,
  createdIds: number[],
): Promise<Entry> {
  const entry = await client.addEntry(payload);
  if (typeof entry?.id === "number") createdIds.push(entry.id);
  return entry;
}

export async function cleanup(
  client: GasClient,
  createdIds: number[],
): Promise<void> {
  const ids = createdIds.splice(0);
  for (const id of ids) {
    try {
      await client.deleteEntry(id);
    } catch {
      // best-effort; orphan rows can be inspected manually
    }
  }
}

/**
 * Safety-net cleanup: deletes every entry whose description starts with the
 * run's marker prefix, regardless of whether its id was tracked. Catches
 * orphans created by failed/raced inserts whose response never came back.
 */
export async function cleanupByMarker(
  client: GasClient,
  run: string,
): Promise<number> {
  const prefix = `__TEST__${run}__`;
  const entries = await client.getEntries();
  const stragglers = entries.filter((e) => e.description.startsWith(prefix));
  for (const e of stragglers) {
    try {
      await client.deleteEntry(e.id);
    } catch {
      // best-effort
    }
  }
  return stragglers.length;
}
