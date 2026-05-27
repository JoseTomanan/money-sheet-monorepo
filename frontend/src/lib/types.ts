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

// { [Subcategory]: total outgoing amount }
export type SubcategoryBreakdown = Record<string, number>;

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
