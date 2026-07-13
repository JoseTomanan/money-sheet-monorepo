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

// STATS sheet wire shapes (docs/adr/0011) — mirrors src/lib/dispatch.ts's
// canonical StatsData; see _contract_parity.ts for the drift guard.
interface CategoryMonthChange {
  category: string;
  incoming: number;
  outgoing: number;
  netChange: number;
}

interface SpendingPaceDay {
  day: number;
  cumulativeThisMonth: number;
  cumulativeUsual: number;
}

interface StatsData {
  categoryMonthChange: CategoryMonthChange[];
  spendingPace: SpendingPaceDay[];
}

