import type { AddEntryPayload, UpdateEntryPatch } from "./types";

const KEY = "ms_queue";

export type QueueItem =
  | { op: "add"; tempId: number; payload: AddEntryPayload }
  | { op: "edit"; id: number; patch: UpdateEntryPatch }
  | { op: "delete"; id: number };

export function readQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QueueItem[]) : [];
  } catch {
    return [];
  }
}

export function writeQueue(q: QueueItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(q));
  } catch {}
}

export function clearQueue(): void {
  writeQueue([]);
}

export function enqueue(item: QueueItem): void {
  const q = readQueue();

  if (item.op === "add") {
    writeQueue([...q, item]);
    return;
  }

  const key = item.id;
  const existingIdx = q.findLastIndex(
    (qi) =>
      (qi.op === "add" && qi.tempId === key) ||
      (qi.op === "edit" && qi.id === key) ||
      (qi.op === "delete" && qi.id === key)
  );

  if (existingIdx === -1) {
    writeQueue([...q, item]);
    return;
  }

  const existing = q[existingIdx];

  if (item.op === "edit") {
    const merged = [...q];
    if (existing.op === "add") {
      merged[existingIdx] = {
        op: "add",
        tempId: existing.tempId,
        payload: { ...existing.payload, ...item.patch },
      };
    } else if (existing.op === "edit") {
      merged[existingIdx] = {
        op: "edit",
        id: existing.id,
        patch: { ...existing.patch, ...item.patch },
      };
    } else {
      merged.push(item); // existing is delete — shouldn't happen, safety fallback
    }
    writeQueue(merged);
    return;
  }

  // item.op === "delete"
  if (existing.op === "add") {
    writeQueue(q.filter((_, i) => i !== existingIdx));
  } else {
    const merged = [...q];
    merged[existingIdx] = item;
    writeQueue(merged);
  }
}
