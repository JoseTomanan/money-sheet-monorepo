/**
 * dispatch.ts — Pure validation + action dispatcher for GAS HTTP handlers.
 *
 * This module contains no SpreadsheetApp or GAS-specific calls so it can be
 * unit-tested locally with injected fakes (see dispatch.test.ts).
 *
 * ## Response envelope
 *
 * Every response conforms to one of two shapes:
 *
 * ### Success
 * ```json
 * { "ok": true, ...actionSpecificFields }
 * ```
 * - `getEntries`:  `{ ok: true, entries: Entry[] }`
 * - `getMaster`:   `{ ok: true, master: MasterRow }`
 * - `getCategories`: `{ ok: true, categories: CategoryMap }`
 * - `getConfig`:   `{ ok: true, config: ConfigMap }`
 * - `addEntry`:    `{ ok: true, entry: Entry }`
 * - `updateEntry`: `{ ok: true }`
 * - `deleteEntry`: `{ ok: true }`
 * - `validate`:    `{ ok: true }`
 *
 * ### Error
 * ```json
 * { "ok": false, "error": string, "code": ErrorCode, "message": string }
 * ```
 * Machine-readable error codes:
 * - `"auth"`       — missing or wrong shared secret
 * - `"validation"` — payload shape or domain invariant violated
 * - `"not_found"`  — referenced Entry ID does not exist
 * - `"internal"`   — unexpected runtime error or unknown action
 *
 * The legacy `error` string is retained for backwards compatibility with the
 * current frontend, which keys off `json.error` (and the sentinel
 * `json.error === "unauthorized"`). `code`/`message` are the structured fields
 * new clients should read. For auth failures `error` is `"unauthorized"`; for
 * all other failures `error` mirrors `message`.
 */

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

export type ErrorCode = "auth" | "validation" | "not_found" | "internal";

export type Direction = "I" | "O";

export interface EntryData {
  id: number;
  date: string;
  tag: string;
  mainCategory: string;
  description: string;
  direction: Direction;
  amount: number;
}

export interface AddEntryPayload {
  date: string;
  tag: string;
  description: string;
  direction: Direction;
  amount: number;
}

export interface AddEntriesPayload {
  entries: AddEntryPayload[];
}

export interface UpdateEntryPatch {
  date?: string;
  tag?: string;
  description?: string;
  direction?: Direction;
  amount?: number;
}

export type CategoryMap = Record<string, string[]>;

// { [key]: value } — key-value pairs from the Config sheet
export type ConfigMap = Record<string, string>;

export type ApiResponse =
  | { ok: true; entries: EntryData[] }
  | { ok: true; master: unknown }
  | { ok: true; categories: CategoryMap }
  | { ok: true; config: unknown }
  | { ok: true; entry: EntryData }
  | { ok: true }
  | { ok: false; error: string; code: ErrorCode; message: string };

// `addEntries` reuses the `{ ok: true; entries: EntryData[] }` success shape
// (same as `getEntries`) — both mean "here is an array of entries."

export interface DispatchRequest {
  action: string;
  /** Present on mutation actions; absent / undefined on reads */
  secret: string | undefined;
  body: Record<string, unknown>;
}

/** Injected dependencies — no GAS globals. */
export interface DispatchDeps {
  /** The stored API secret (from Script Properties). */
  secret: string;
  getCategories: () => CategoryMap;
  getMaster?: () => unknown;
  getEntries?: () => EntryData[];
  getConfig?: () => unknown;
  getEntryById: (id: number) => EntryData | null;
  addEntry: (payload: AddEntryPayload) => EntryData;
  /** Inserts all legs under one document-lock acquisition; returns entries in array order. */
  addEntries: (payloads: AddEntryPayload[]) => EntryData[];
  updateEntry: (id: number, patch: UpdateEntryPatch) => void;
  deleteEntry: (id: number) => void;
}

// ──────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────

function err(code: ErrorCode, message: string): ApiResponse {
  // `error` keeps the legacy wire contract the current frontend depends on:
  // the "unauthorized" sentinel for auth failures, otherwise the human message.
  const error = code === "auth" ? "unauthorized" : message;
  return { ok: false, error, code, message };
}

/** Build a flat set of all known subcategories from the CategoryMap. */
function allSubcategories(categories: CategoryMap): Set<string> {
  const set = new Set<string>();
  for (const subs of Object.values(categories)) {
    for (const s of subs) set.add(s);
  }
  return set;
}

/** Build a flat set of all known category names (keys). */
function allCategories(categories: CategoryMap): Set<string> {
  return new Set(Object.keys(categories));
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s: string): boolean {
  if (!ISO_DATE_RE.test(s)) return false;
  const d = new Date(s);
  return !isNaN(d.getTime());
}

// ──────────────────────────────────────────────────────────────
// Tag/Direction invariant check
// ──────────────────────────────────────────────────────────────

/**
 * Returns a validation error message if the tag is invalid for the given
 * direction, or null if valid.
 *
 * Invariant:
 * - Incoming (I): tag must be a Category (top-level key in CategoryMap)
 * - Outgoing (O): tag must be a Subcategory (leaf value in CategoryMap)
 */
export function checkTagDirection(
  tag: string,
  direction: Direction,
  categories: CategoryMap
): string | null {
  const cats = allCategories(categories);
  const subs = allSubcategories(categories);

  if (direction === "I") {
    if (!cats.has(tag)) {
      return `Tag "${tag}" is not a Category. Incoming entries require a Category tag (e.g. FOOD, HOUSING).`;
    }
  } else {
    if (!subs.has(tag)) {
      return `Tag "${tag}" is not a Subcategory. Outgoing entries require a Subcategory tag (e.g. Dining, Rent).`;
    }
  }
  return null;
}

// ──────────────────────────────────────────────────────────────
// Payload validators
// ──────────────────────────────────────────────────────────────

function validateAddPayload(
  body: Record<string, unknown>,
  categories: CategoryMap
): { payload: AddEntryPayload } | { error: ApiResponse } {
  const date = body.date;
  const tag = body.tag;
  const description = body.description ?? "";
  const directionRaw = body.direction;
  const amountRaw = body.amount;

  if (typeof date !== "string" || !date || !isValidDate(date)) {
    return { error: err("validation", `"date" must be a valid ISO date string (YYYY-MM-DD), got: ${JSON.stringify(date)}`) };
  }
  if (typeof tag !== "string" || !tag.trim()) {
    return { error: err("validation", '"tag" is required and must be a non-empty string') };
  }
  if (directionRaw !== "I" && directionRaw !== "O") {
    return { error: err("validation", `"direction" must be "I" or "O", got: ${JSON.stringify(directionRaw)}`) };
  }
  const direction = directionRaw as Direction;

  const amount = Number(amountRaw);
  if (!isFinite(amount)) {
    return { error: err("validation", `"amount" must be a finite number, got: ${JSON.stringify(amountRaw)}`) };
  }
  if (direction === "O" && amount < 0) {
    return { error: err("validation", "Outgoing entries cannot have a negative amount") };
  }

  const tagErr = checkTagDirection(tag.trim(), direction, categories);
  if (tagErr) return { error: err("validation", tagErr) };

  return {
    payload: {
      date,
      tag: tag.trim(),
      description: String(description),
      direction,
      amount,
    },
  };
}

/**
 * Validate-then-write: every leg is checked against the identical single-leg
 * rules (`validateAddPayload`) before any write happens. The first invalid
 * leg rejects the whole batch — no partial validation, no partial write.
 */
function validateAddBatchPayload(
  body: Record<string, unknown>,
  categories: CategoryMap
): { payloads: AddEntryPayload[] } | { error: ApiResponse } {
  const entries = body.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return { error: err("validation", '"entries" must be a non-empty array') };
  }

  const payloads: AddEntryPayload[] = [];
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) {
      return { error: err("validation", "each entry in \"entries\" must be an object") };
    }
    const result = validateAddPayload(entry as Record<string, unknown>, categories);
    if ("error" in result) return result;
    payloads.push(result.payload);
  }

  return { payloads };
}

function validateUpdatePayload(
  body: Record<string, unknown>,
  existingEntry: EntryData,
  categories: CategoryMap
): { id: number; patch: UpdateEntryPatch } | { error: ApiResponse } {
  const id = Number(body.id);
  if (!isFinite(id) || id <= 0) {
    return { error: err("validation", '"id" must be a positive integer') };
  }

  const patch: UpdateEntryPatch = {};

  if (body.date !== undefined) {
    const date = String(body.date);
    if (!isValidDate(date)) {
      return { error: err("validation", `"date" must be a valid ISO date string (YYYY-MM-DD), got: ${JSON.stringify(date)}`) };
    }
    patch.date = date;
  }
  if (body.tag !== undefined) {
    patch.tag = String(body.tag).trim();
  }
  if (body.description !== undefined) {
    patch.description = String(body.description);
  }
  if (body.direction !== undefined) {
    if (body.direction !== "I" && body.direction !== "O") {
      return { error: err("validation", `"direction" must be "I" or "O", got: ${JSON.stringify(body.direction)}`) };
    }
    patch.direction = body.direction as Direction;
  }
  if (body.amount !== undefined) {
    const amount = Number(body.amount);
    if (!isFinite(amount)) {
      return { error: err("validation", `"amount" must be a finite number, got: ${JSON.stringify(body.amount)}`) };
    }
    patch.amount = amount;
  }

  // Determine effective tag and direction after the patch is applied
  const effectiveDirection = patch.direction ?? existingEntry.direction;
  const effectiveTag = patch.tag ?? existingEntry.tag;
  const effectiveAmount = patch.amount ?? existingEntry.amount;

  if (effectiveDirection === "O" && effectiveAmount < 0) {
    return { error: err("validation", "Outgoing entries cannot have a negative amount") };
  }

  const tagErr = checkTagDirection(effectiveTag, effectiveDirection, categories);
  if (tagErr) return { error: err("validation", tagErr) };

  return { id, patch };
}

// ──────────────────────────────────────────────────────────────
// Auth check
// ──────────────────────────────────────────────────────────────

// Public reads — no secret required (ADR-0002).
const READ_ACTIONS = new Set(["getEntries", "getMaster", "getCategories", "getConfig"]);
// Actions gated behind the shared secret. `validate` is the secret-check
// endpoint itself, so it must be authenticated even though it mutates nothing —
// the frontend's connection check relies on a wrong secret being rejected here.
const AUTH_ACTIONS = new Set(["validate", "addEntry", "addEntries", "updateEntry", "deleteEntry"]);

function isKnownAction(action: string): boolean {
  return READ_ACTIONS.has(action) || AUTH_ACTIONS.has(action);
}

function requiresAuth(action: string): boolean {
  return AUTH_ACTIONS.has(action);
}

// ──────────────────────────────────────────────────────────────
// Main dispatcher
// ──────────────────────────────────────────────────────────────

export function dispatch(request: DispatchRequest, deps: DispatchDeps): ApiResponse {
  const { action, secret: reqSecret, body } = request;

  // Reject unknown actions before the auth gate so they report as `internal`
  // rather than masquerading as an auth failure.
  if (!isKnownAction(action)) {
    return err("internal", `Unknown action: ${JSON.stringify(action)}`);
  }

  // Auth gate for mutations
  if (requiresAuth(action)) {
    if (!reqSecret || reqSecret !== deps.secret) {
      return err("auth", "Missing or invalid API secret");
    }
  }

  try {
    // ── Read actions ──────────────────────────────────────────
    if (action === "getCategories") {
      return { ok: true, categories: deps.getCategories() };
    }

    if (action === "getMaster") {
      const master = deps.getMaster?.();
      return { ok: true, master };
    }

    if (action === "getEntries") {
      const entries = deps.getEntries?.() ?? [];
      return { ok: true, entries };
    }

    if (action === "getConfig") {
      const config = deps.getConfig?.();
      return { ok: true, config };
    }

    if (action === "validate") {
      return { ok: true };
    }

    // ── Write actions ─────────────────────────────────────────
    if (action === "addEntry") {
      const categories = deps.getCategories();
      const result = validateAddPayload(body, categories);
      if ("error" in result) return result.error;
      const entry = deps.addEntry(result.payload);
      return { ok: true, entry };
    }

    if (action === "addEntries") {
      const categories = deps.getCategories();
      const result = validateAddBatchPayload(body, categories);
      if ("error" in result) return result.error;
      const entries = deps.addEntries(result.payloads);
      return { ok: true, entries };
    }

    if (action === "updateEntry") {
      const id = Number(body.id);
      const existing = deps.getEntryById(id);
      if (!existing) {
        return err("not_found", `Entry with id ${id} not found`);
      }
      const categories = deps.getCategories();
      const result = validateUpdatePayload(body, existing, categories);
      if ("error" in result) return result.error;
      deps.updateEntry(result.id, result.patch);
      return { ok: true };
    }

    if (action === "deleteEntry") {
      const id = Number(body.id);
      try {
        deps.deleteEntry(id);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.toLowerCase().includes("not found")) {
          return err("not_found", `Entry with id ${id} not found`);
        }
        throw e;
      }
      return { ok: true };
    }

    // Unknown action
    return err("internal", `Unknown action: ${JSON.stringify(action)}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err("internal", message);
  }
}
