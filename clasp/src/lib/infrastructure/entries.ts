import { createEntryApplication, type EntryChangeResult } from "../application/entries";
import type {
  AddEntriesPayload,
  AddEntryRequest,
  IdempotentAddEntriesResult,
  IdempotentAddEntryResult,
  UpdateEntryPatch,
} from "../application/dispatch";
import type { Entry } from "../domain/entry";
import { applicationEntryRepository } from "./entryRepository";
import { getCategories } from "./categories";
import { runExclusive } from "./locking";
import { liveIoRepository } from "./sheets";

const ENTRY_TZ = "Asia/Manila";

function formatEntryDate(raw: unknown): string {
  try {
    // Utilities.formatDate handles Date objects; try/catch avoids instanceof issues in the GAS sandbox
    return Utilities.formatDate(raw as Date, ENTRY_TZ, "yyyy-MM-dd");
  } catch {
    return raw ? String(raw) : "";
  }
}

export function getEntries(): Entry[] {
  return entryApplication().list();
}

export function addEntry(request: AddEntryRequest): IdempotentAddEntryResult {
  return entryApplication().add(request);
}

/** Inserts all legs under one document-lock acquisition (issue #111). */
export function addEntries(request: AddEntriesPayload): IdempotentAddEntriesResult {
  return entryApplication().addMany(request);
}

export function updateEntry(id: number, patch: UpdateEntryPatch): EntryChangeResult {
  return entryApplication().update(id, patch);
}

export function deleteEntry(id: number): EntryChangeResult {
  return entryApplication().remove(id);
}

function entryApplication(): ReturnType<typeof createEntryApplication> {
  const io = liveIoRepository();
  return createEntryApplication({
    getCategories,
    repository: applicationEntryRepository(io, formatEntryDate),
    transact: (work) => runExclusive(
      LockService.getDocumentLock(),
      10_000,
      () => work(applicationEntryRepository(io, formatEntryDate)),
    ),
  });
}
