import { checkTagDirection, type CategoryMap } from "../domain/category";
import { entryInvariantViolation, type Direction, type Entry } from "../domain/entry";

export interface AddEntryPayload {
  date: string;
  tag: string;
  description: string;
  direction: Direction;
  amount: number;
}

export interface AddEntryRequest extends AddEntryPayload {
  mutationId: string;
}

export interface AddEntriesPayload {
  entries: AddEntryPayload[];
  mutationId: string;
}

export interface UpdateEntryPatch {
  date?: string;
  tag?: string;
  description?: string;
  direction?: Direction;
  amount?: number;
}

export type IdempotentAddEntryResult =
  | { status: "created" | "duplicate"; entry: Entry }
  | { status: "mismatch" }
  | { status: "validation"; message: string };

export type IdempotentAddEntriesResult =
  | { status: "created" | "duplicate"; entries: Entry[] }
  | { status: "mismatch" }
  | { status: "validation"; message: string };

/**
 * Application port for Entry persistence. Implementations preserve sheet-row
 * identity, exclude separator rows, and keep Entry and Mutation IDs intact.
 */
export interface EntryRepository {
  list(): Entry[];
  findByMutationId(mutationId: string): Entry[];
  insert(request: AddEntryRequest): Entry;
  insertMany(request: AddEntriesPayload): Entry[];
  update(id: number, patch: UpdateEntryPatch): boolean;
  remove(id: number): boolean;
}

export interface EntryTransaction {
  <T>(work: (repository: EntryRepository) => T): T;
}

export interface EntryApplication {
  list(): Entry[];
  find(id: number): Entry | null;
  add(request: AddEntryRequest): IdempotentAddEntryResult;
  addMany(request: AddEntriesPayload): IdempotentAddEntriesResult;
  update(id: number, patch: UpdateEntryPatch): EntryChangeResult;
  remove(id: number): EntryChangeResult;
}

export type EntryChangeResult =
  | { status: "updated" | "deleted"; id: number }
  | { status: "not_found"; id: number }
  | { status: "validation"; message: string };

function matches(entry: Entry, payload: AddEntryPayload): boolean {
  return entry.date === payload.date
    && entry.tag === payload.tag
    && entry.description === payload.description
    && entry.direction === payload.direction
    && entry.amount === payload.amount;
}

export function createEntryApplication(deps: {
  repository: EntryRepository;
  transact: EntryTransaction;
  getCategories: () => CategoryMap;
}): EntryApplication {
  return {
    list: () => deps.repository.list(),
    find: (id) => deps.repository.list().find((entry) => entry.id === id) ?? null,
    add: (request) => deps.transact((repository) => {
      const message = entryInvariantViolation(request, deps.getCategories());
      if (message) return { status: "validation", message };
      const existing = repository.findByMutationId(request.mutationId);
      if (existing.length > 0) {
        return existing.length === 1 && matches(existing[0], request)
          ? { status: "duplicate", entry: existing[0] }
          : { status: "mismatch" };
      }
      return { status: "created", entry: repository.insert(request) };
    }),
    addMany: (request) => deps.transact((repository) => {
      const categories = deps.getCategories();
      for (const entry of request.entries) {
        const message = entryInvariantViolation(entry, categories);
        if (message) return { status: "validation", message };
      }
      const existing = repository.findByMutationId(request.mutationId)
        .sort((left, right) => left.id - right.id);
      if (existing.length > 0) {
        return existing.length === request.entries.length
          && existing.every((entry, index) => matches(entry, request.entries[index]))
          ? { status: "duplicate", entries: existing }
          : { status: "mismatch" };
      }
      return { status: "created", entries: repository.insertMany(request) };
    }),
    update: (id, patch) => deps.transact((repository) => {
      const existing = repository.list().find((entry) => entry.id === id);
      if (!existing) return { status: "not_found", id };
      const message = checkTagDirection(
        patch.tag ?? existing.tag,
        patch.direction ?? existing.direction,
        deps.getCategories(),
      );
      if (message) return { status: "validation", message };
      return repository.update(id, patch)
        ? { status: "updated", id }
        : { status: "not_found", id };
    }),
    remove: (id) => deps.transact((repository) => repository.remove(id))
      ? { status: "deleted", id }
      : { status: "not_found", id },
  };
}
