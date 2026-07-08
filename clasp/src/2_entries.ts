const ENTRY_TZ = "Asia/Manila";

function formatEntryDate(raw: unknown): string {
  try {
    // Utilities.formatDate handles Date objects; try/catch avoids instanceof issues in the GAS sandbox
    return Utilities.formatDate(raw as Date, ENTRY_TZ, "yyyy-MM-dd");
  } catch {
    return raw ? String(raw) : "";
  }
}

function getEntries(): Entry[] {
  return listEntries(liveIoRepository(), formatEntryDate);
}

interface AddEntryPayload {
  date: string;
  tag: string;
  description: string;
  direction: Direction;
  amount: number;
}

function addEntry(payload: AddEntryPayload): Entry {
  const lock = LockService.getDocumentLock();
  lock.waitLock(10_000);
  try {
    return insertEntry(liveIoRepository(), payload);
  } finally {
    lock.releaseLock();
  }
}

interface UpdateEntryPatch {
  date?: string;
  tag?: string;
  description?: string;
  direction?: Direction;
  amount?: number;
}

function updateEntry(id: number, patch: UpdateEntryPatch): void {
  const lock = LockService.getDocumentLock();
  lock.waitLock(10_000);
  try {
    patchEntry(liveIoRepository(), id, patch);
  } finally {
    lock.releaseLock();
  }
}

function deleteEntry(id: number): void {
  const lock = LockService.getDocumentLock();
  lock.waitLock(10_000);
  try {
    removeEntry(liveIoRepository(), id);
  } finally {
    lock.releaseLock();
  }
}
