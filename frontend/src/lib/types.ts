import type {
  ApiResponse,
  AddEntryPayload,
  UpdateEntryPatch,
  StatsData,
} from "../../../clasp/src/lib/application/dispatch";
import type { Direction, Entry } from "../../../clasp/src/lib/domain/entry";
import type { CategoryMap } from "../../../clasp/src/lib/domain/category";

export type { Direction, Entry } from "../../../clasp/src/lib/domain/entry";
export type { CategoryMap } from "../../../clasp/src/lib/domain/category";
export type {
  AddEntryPayload,
  AddEntryRequest,
  AddEntriesPayload,
  UpdateEntryPatch,
  ConfigMap,
  CategoryMonthChange,
  SpendingPaceDay,
  StatsWindow,
  WindowTotal,
  WindowCategorySpend,
  StatsData,
} from "../../../clasp/src/lib/application/dispatch";

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
