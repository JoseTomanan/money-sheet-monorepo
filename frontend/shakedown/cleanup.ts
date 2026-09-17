export const SHAKEDOWN_MARK = "__GOLIVECHK__";

export interface ShakedownEntry {
  id: number;
  date: string;
  tag: string;
  mainCategory: string;
  description: string;
  direction: "I" | "O";
  amount: number;
}

export async function sweepMarkedEntries(
  getEntries: () => Promise<ShakedownEntry[]>,
  deleteEntry: (id: number) => Promise<void>,
): Promise<ShakedownEntry[]> {
  const marked = (await getEntries()).filter((entry) =>
    entry.description?.startsWith(SHAKEDOWN_MARK),
  );
  for (const entry of marked) {
    await deleteEntry(entry.id);
  }
  return getEntries();
}

export function assertBaselineRestored(
  baseline: ShakedownEntry[],
  current: ShakedownEntry[],
): void {
  if (current.some((entry) => entry.description?.startsWith(SHAKEDOWN_MARK))) {
    throw new Error("Sheet still contains marked shakedown rows after cleanup");
  }
  if (JSON.stringify(current) !== JSON.stringify(baseline)) {
    throw new Error("Sheet does not match the exact pre-shakedown baseline");
  }
}
