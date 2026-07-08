export type Direction = "I" | "O";

export interface Connection {
  gasUrl: string;
  apiSecret: string;
}

export interface Entry {
  id: number;
  date: string;
  tag: string;
  mainCategory: string;
  description: string;
  direction: Direction;
  amount: number;
}

export interface MasterRow {
  onHand: number;
  budgets: Record<string, number>;
}

// { [Category]: Subcategory[] }
export type CategoryMap = Record<string, string[]>;

export interface Config {
  currency: string;
  [key: string]: string;
}

export interface AddEntryPayload {
  date: string;
  tag: string;
  description: string;
  direction: Direction;
  amount: number;
}

export interface UpdateEntryPatch {
  date?: string;
  tag?: string;
  description?: string;
  direction?: Direction;
  amount?: number;
}

export type EntryMutation =
  | { type: 'add'; payload: AddEntryPayload | AddEntryPayload[] }
  | { type: 'edit'; id: number; patch: UpdateEntryPatch };

// Machine-readable error codes from the GAS dispatch envelope — see
// clasp/src/lib/dispatch.ts's `ErrorCode` / `ApiResponse` for the canonical definitions.
export type ApiErrorCode = "auth" | "validation" | "not_found" | "internal";

export interface ApiErrorEnvelope {
  ok: false;
  error: string;
  code: ApiErrorCode;
  message: string;
}

export interface GatewayAdapter {
  getEntries(): Promise<Entry[]>;
  getMaster(): Promise<MasterRow>;
  getCategories(): Promise<CategoryMap>;
  getConfig(): Promise<Config>;
  addEntry(payload: AddEntryPayload): Promise<Entry>;
  updateEntry(id: number, patch: UpdateEntryPatch): Promise<void>;
  deleteEntry(id: number): Promise<void>;
  validateConnection(gasUrl: string, apiSecret: string): Promise<void>;
}
