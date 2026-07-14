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

// STATS wire shapes (docs/adr/0011) — mirrors clasp/src/lib/dispatch.ts's
// canonical StatsData; see wire-contract.parity.ts for the drift guard.
// GAS computes these entirely in the STATS sheet's formulas — this package
// only renders them, never recomputes.
export interface CategoryMonthChange {
  category: string;
  incoming: number;
  outgoing: number;
  netChange: number;
}

export interface SpendingPaceDay {
  day: number;
  cumulativeThisMonth: number;
  cumulativeUsual: number;
}

// Rolling-window key for the Deeper Statistics page (#132). Capped at ~1
// year — no all-time statistics.
export type StatsWindow = "30d" | "3mo" | "12mo";

export interface WindowTotal {
  window: StatsWindow;
  incoming: number;
  outgoing: number;
  net: number;
}

export interface WindowCategorySpend {
  window: StatsWindow;
  category: string;
  outgoing: number;
}

export interface StatsData {
  categoryMonthChange: CategoryMonthChange[];
  spendingPace: SpendingPaceDay[];
  windowTotals: WindowTotal[];
  windowCategorySpend: WindowCategorySpend[];
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
  getStats(): Promise<StatsData>;
  addEntry(payload: AddEntryPayload): Promise<Entry>;
  addEntries(payloads: AddEntryPayload[]): Promise<Entry[]>;
  updateEntry(id: number, patch: UpdateEntryPatch): Promise<void>;
  deleteEntry(id: number): Promise<void>;
  validateConnection(gasUrl: string, apiSecret: string): Promise<void>;
}
