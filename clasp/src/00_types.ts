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

// { [Subcategory]: total outgoing amount }
type SubcategoryBreakdown = Record<string, number>;
