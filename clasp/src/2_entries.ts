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
  return entryApplication().list();
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
  return entryApplication().add(request);
}

/** Inserts all legs under one document-lock acquisition (issue #111). */
function addEntries(request: AddEntriesPayload): IdempotentAddEntriesResult {
  return entryApplication().addMany(request);
}

interface UpdateEntryPatch {
  date?: string;
  tag?: string;
  description?: string;
  direction?: Direction;
  amount?: number;
}

function updateEntry(id: number, patch: UpdateEntryPatch): void {
  const result = entryApplication().update(id, patch);
  if (result.status === "not_found") throw new Error(`Entry ${id} not found`);
}

function deleteEntry(id: number): void {
  const result = entryApplication().remove(id);
  if (result.status === "not_found") throw new Error(`Entry ${id} not found`);
}

function applicationEntryRepository(io: IoRepository): EntryRepository {
  let rows: IoRow[] | null = null;
  const snapshot = (): IoRow[] => rows ??= io.readRows();
  return {
    list: () => listEntries(io, formatEntryDate),
    findByMutationId: (mutationId) => findEntriesByMutationId(
      snapshot(),
      mutationId,
      formatEntryDate,
    ).map((entry) => ({ ...entry, mutationId })),
    insert: (request) => insertEntry(io, request, request.mutationId, snapshot()),
    insertMany: (request) => insertEntries(
      io,
      request.entries,
      request.mutationId,
      snapshot(),
    ),
    update: (id, patch) => {
      try {
        patchEntry(io, id, patch, formatEntryDate);
        return true;
      } catch (error) {
        if (String(error).toLowerCase().includes("not found")) return false;
        throw error;
      }
    },
    remove: (id) => {
      try {
        removeEntry(io, id);
        return true;
      } catch (error) {
        if (String(error).toLowerCase().includes("not found")) return false;
        throw error;
      }
    },
  };
}

function entryApplication(): ReturnType<typeof createEntryApplication> {
  const io = liveIoRepository();
  return createEntryApplication({
    repository: applicationEntryRepository(io),
    transact: (work) => runExclusive(
      LockService.getDocumentLock(),
      10_000,
      () => work(applicationEntryRepository(io)),
    ),
  });
}
