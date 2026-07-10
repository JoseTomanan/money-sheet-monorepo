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
  return runExclusive(LockService.getDocumentLock(), 10_000, () =>
    insertEntry(liveIoRepository(), payload)
  );
}

/** Inserts all legs under one document-lock acquisition (issue #111). */
function addEntries(payloads: AddEntryPayload[]): Entry[] {
  return runExclusive(LockService.getDocumentLock(), 10_000, () =>
    insertEntries(liveIoRepository(), payloads)
  );
}

interface UpdateEntryPatch {
  date?: string;
  tag?: string;
  description?: string;
  direction?: Direction;
  amount?: number;
}

function updateEntry(id: number, patch: UpdateEntryPatch): void {
  runExclusive(LockService.getDocumentLock(), 10_000, () =>
    patchEntry(liveIoRepository(), id, patch)
  );
}

function deleteEntry(id: number): void {
  runExclusive(LockService.getDocumentLock(), 10_000, () => removeEntry(liveIoRepository(), id));
}
