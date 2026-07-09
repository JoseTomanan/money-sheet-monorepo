import type {
  Entry,
  MasterRow,
  CategoryMap,
  Config,
  AddEntryPayload,
  UpdateEntryPatch,
  GatewayAdapter,
} from "./types";
import { connection, mockMode } from "./connection.svelte";
import { RealAdapter } from "./adapter-real";
import { MockAdapter } from "./adapter-mock";

export { ConnectionError, ConnectionMissingError, UnauthorizedError, isQueueable, isAuthError, userMessage } from "./adapter-real";
export type { GatewayAdapter } from "./types";

const mockAdapter = new MockAdapter();
const realAdapter = new RealAdapter(() => connection.current);
let _override: GatewayAdapter | null = null;

// Selected per call, not captured at import time — mockMode.current is a live
// predicate, so a Connection saved (or Mock Dismissal set) at runtime takes
// effect on the very next call without a page reload.
function adapter(): GatewayAdapter {
  return _override ?? (mockMode.current ? mockAdapter : realAdapter);
}

export function setAdapter(a: GatewayAdapter): void {
  _override = a;
}

export async function validateConnection(gasUrl: string, apiSecret: string): Promise<void> {
  return adapter().validateConnection(gasUrl, apiSecret);
}

export async function getEntries(): Promise<Entry[]> {
  return adapter().getEntries();
}

export async function getMaster(): Promise<MasterRow> {
  return adapter().getMaster();
}

export async function getCategories(): Promise<CategoryMap> {
  return adapter().getCategories();
}

export async function getConfig(): Promise<Config> {
  return adapter().getConfig();
}

export async function addEntry(payload: AddEntryPayload): Promise<Entry> {
  return adapter().addEntry(payload);
}

export async function addEntries(payloads: AddEntryPayload[]): Promise<Entry[]> {
  return adapter().addEntries(payloads);
}

export async function updateEntry(id: number, patch: UpdateEntryPatch): Promise<void> {
  return adapter().updateEntry(id, patch);
}

export async function deleteEntry(id: number): Promise<void> {
  return adapter().deleteEntry(id);
}
