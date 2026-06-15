// Ambient globals so non-module GAS files can call the dispatcher without importing.
// At runtime, dist/lib/dispatch.js is loaded (the `export` keyword is stripped by the
// build step) and its function declarations are hoisted into the shared GAS global scope.
// These declarations mirror the exported surface of src/lib/dispatch.ts, expressed in
// terms of the GAS-global domain types (Entry, CategoryMap, …) from 0_types.ts.

type DispatchErrorCode = "auth" | "validation" | "not_found" | "internal";

interface DispatchRequest {
  action: string;
  /** Present on auth-gated actions; absent on public reads. */
  secret: string | undefined;
  body: Record<string, unknown>;
}

interface DispatchDeps {
  /** The stored API secret (from Script Properties). */
  secret: string;
  getCategories: () => CategoryMap;
  getMaster?: () => MasterRow;
  getEntries?: () => Entry[];
  getConfig?: () => ConfigMap;
  getEntryById: (id: number) => Entry | null;
  addEntry: (payload: AddEntryPayload) => Entry;
  updateEntry: (id: number, patch: UpdateEntryPatch) => void;
  deleteEntry: (id: number) => void;
}

type DispatchResponse =
  | { ok: true; [key: string]: unknown }
  | { ok: false; error: string; code: DispatchErrorCode; message: string };

declare function dispatch(request: DispatchRequest, deps: DispatchDeps): DispatchResponse;
