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
import { isMockMode } from "./mock";
import { RealAdapter } from "./adapter-real";
import { MockAdapter } from "./adapter-mock";

export { ConnectionError, ConnectionMissingError, UnauthorizedError } from "./adapter-real";
export type { GatewayAdapter } from "./types";

let _adapter: GatewayAdapter = (isMockMode || mockMode.current)
  ? new MockAdapter()
  : new RealAdapter(() => connection.current);

export function setAdapter(a: GatewayAdapter): void {
  _adapter = a;
}

export async function validateConnection(gasUrl: string, apiSecret: string): Promise<void> {
  return _adapter.validateConnection(gasUrl, apiSecret);
}

export async function getEntries(): Promise<Entry[]> {
  return _adapter.getEntries();
}

export async function getMaster(): Promise<MasterRow> {
  return _adapter.getMaster();
}

export async function getCategories(): Promise<CategoryMap> {
  return _adapter.getCategories();
}

export async function getConfig(): Promise<Config> {
  return _adapter.getConfig();
}

export async function addEntry(payload: AddEntryPayload): Promise<Entry> {
  return _adapter.addEntry(payload);
}

export async function updateEntry(id: number, patch: UpdateEntryPatch): Promise<void> {
  return _adapter.updateEntry(id, patch);
}

export async function deleteEntry(id: number): Promise<void> {
  return _adapter.deleteEntry(id);
}
