import type {
  ApiResponse,
  EntryData as Entry,
  AddEntryPayload,
  UpdateEntryPatch,
  CategoryMap,
  StatsData,
} from "../../../clasp/src/lib/dispatch";

export type {
  Direction,
  EntryData as Entry,
  AddEntryPayload,
  AddEntryRequest,
  AddEntriesPayload,
  UpdateEntryPatch,
  CategoryMap,
  ConfigMap,
  CategoryMonthChange,
  SpendingPaceDay,
  StatsWindow,
  WindowTotal,
  WindowCategorySpend,
  StatsData,
} from "../../../clasp/src/lib/dispatch";

export interface Connection {
  gasUrl: string;
  apiSecret: string;
}

export interface MasterRow {
  onHand: number;
  budgets: Record<string, number>;
}

export interface Config {
  currency: string;
  [key: string]: string;
}

export type EntryMutation =
  | { type: 'add'; payload: AddEntryPayload | AddEntryPayload[] }
  | { type: 'edit'; id: number; patch: UpdateEntryPatch };

export type ApiErrorEnvelope = Extract<ApiResponse, { ok: false }>;
export type ApiErrorCode = ApiErrorEnvelope["code"];

export interface GatewayAdapter {
  getEntries(): Promise<Entry[]>;
  getMaster(): Promise<MasterRow>;
  getCategories(): Promise<CategoryMap>;
  getConfig(): Promise<Config>;
  getStats(): Promise<StatsData>;
  addEntry(payload: AddEntryPayload, mutationId?: string): Promise<Entry>;
  addEntries(payloads: AddEntryPayload[], mutationId?: string): Promise<Entry[]>;
  updateEntry(id: number, patch: UpdateEntryPatch): Promise<void>;
  deleteEntry(id: number): Promise<void>;
  validateConnection(gasUrl: string, apiSecret: string): Promise<void>;
}
