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

interface AddEntryRequest extends AddEntryPayload {
  mutationId: string;
}

interface AddEntriesPayload {
  entries: AddEntryPayload[];
  mutationId: string;
}

type IdempotentAddEntryResult =
  | { status: "created" | "duplicate"; entry: Entry }
  | { status: "mismatch" };

type IdempotentAddEntriesResult =
  | { status: "created" | "duplicate"; entries: Entry[] }
  | { status: "mismatch" };

function addEntry(request: AddEntryRequest): IdempotentAddEntryResult {
  return runExclusive(LockService.getDocumentLock(), 10_000, () => {
    const repo = liveIoRepository();
    const rows = repo.readRows();
    const existing = findEntriesByMutationId(rows, request.mutationId, formatEntryDate);
    if (existing.length > 0) {
      return payloadsMatch(existing, [request])
        ? { status: "duplicate", entry: existing[0] }
        : { status: "mismatch" };
    }
    return {
      status: "created",
      entry: insertEntry(repo, request, request.mutationId, rows),
    };
  });
}

/** Inserts all legs under one document-lock acquisition (issue #111). */
function addEntries(request: AddEntriesPayload): IdempotentAddEntriesResult {
  return runExclusive(LockService.getDocumentLock(), 10_000, () => {
    const repo = liveIoRepository();
    const rows = repo.readRows();
    const existing = findEntriesByMutationId(rows, request.mutationId, formatEntryDate);
    if (existing.length > 0) {
      return payloadsMatch(existing, request.entries)
        ? { status: "duplicate", entries: existing }
        : { status: "mismatch" };
    }
    return {
      status: "created",
      entries: insertEntries(repo, request.entries, request.mutationId, rows),
    };
  });
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
    patchEntry(liveIoRepository(), id, patch, formatEntryDate)
  );
}

function deleteEntry(id: number): void {
  runExclusive(LockService.getDocumentLock(), 10_000, () => removeEntry(liveIoRepository(), id));
}
