type Direction = "I" | "O";

interface Entry {
  id: number;
  date: string;
  tag: string;
  mainCategory: string;
  description: string;
  direction: Direction;
  amount: number;
}

interface MasterRow {
  onHand: number;
  budgets: Record<string, number>;
}

// { [Category]: Subcategory[] }
type CategoryMap = Record<string, string[]>;

// { [key]: value } — key-value pairs from the Config sheet
type ConfigMap = Record<string, string>;

