import type {
  Entry,
  MasterRow,
  Config,
  StatsData,
  CategoryMonthChange,
  SpendingPaceDay,
  StatsWindow,
  WindowTotal,
  WindowCategorySpend,
  AddEntryPayload,
  UpdateEntryPatch,
} from "./types";
import { CATEGORY_MAP } from "./theme";
import { buildEntry, getMainCategory } from "./domain";
import { today } from "./format";

function daysAgo(n: number): string {
  const [y, m, d] = today().split('-').map(Number);
  const date = new Date(y, m - 1, d - n);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

let entries: Entry[] = [
  // 3 weeks ago (days 20–15)
  { id: 1,  date: daysAgo(20), tag: "Groceries",        mainCategory: "FOOD",      description: "57 cans of anchovies (why)",         direction: "O", amount: 720 },
  { id: 2,  date: daysAgo(20), tag: "Commute Fare",     mainCategory: "TRANSIT",   description: "segway rental, fell immediately",    direction: "O", amount: 40 },
  { id: 3,  date: daysAgo(19), tag: "Dining",           mainCategory: "FOOD",      description: "ate an entire wheel of cheese",      direction: "O", amount: 185 },
  { id: 4,  date: daysAgo(19), tag: "Leisure",          mainCategory: "LIFESTYLE", description: "paid to watch paint dry (literally)", direction: "O", amount: 300 },
  { id: 5,  date: daysAgo(18), tag: "Commute Fare",     mainCategory: "TRANSIT",   description: "unicycle to office",                 direction: "O", amount: 130 },
  { id: 6,  date: daysAgo(18), tag: "Dining",           mainCategory: "FOOD",      description: "soup with exactly 3 noodles",        direction: "O", amount: 75 },
  { id: 7,  date: daysAgo(18), tag: "Pharmacy",         mainCategory: "HEALTH",    description: "vitamins shaped like dinosaurs",     direction: "O", amount: 250 },
  { id: 8,  date: daysAgo(17), tag: "Fuel",             mainCategory: "TRANSIT",   description: "refueled the horse",                 direction: "O", amount: 800 },
  { id: 9,  date: daysAgo(17), tag: "Dining",           mainCategory: "FOOD",      description: "dinner: just bread, 9 loaves",       direction: "O", amount: 220 },
  { id: 10, date: daysAgo(16), tag: "Groceries",        mainCategory: "FOOD",      description: "bulk purchase of candy corn",        direction: "O", amount: 430 },
  { id: 11, date: daysAgo(16), tag: "Leisure",          mainCategory: "LIFESTYLE", description: "netflix for my goldfish",             direction: "O", amount: 199 },
  // weekly allowance — 15 days ago
  { id: 12, date: daysAgo(15), tag: "FOOD",             mainCategory: "FOOD",      description: "allowance from future self",         direction: "I", amount: 1500 },
  { id: 13, date: daysAgo(15), tag: "TRANSIT",          mainCategory: "TRANSIT",   description: "allowance from future self",         direction: "I", amount: 500 },
  { id: 14, date: daysAgo(15), tag: "Dining",           mainCategory: "FOOD",      description: "brunch: 4 pancakes, 0 regrets",      direction: "O", amount: 340 },
  // 2 weeks ago (days 14–8)
  { id: 15, date: daysAgo(14), tag: "Commute Fare",     mainCategory: "TRANSIT",   description: "bus fare (sat on a stranger's lap)", direction: "O", amount: 60 },
  { id: 16, date: daysAgo(14), tag: "Utilities",        mainCategory: "HOUSING",   description: "electric bill for haunted house",    direction: "O", amount: 650 },
  { id: 17, date: daysAgo(13), tag: "Dining",           mainCategory: "FOOD",      description: "team lunch (team was imaginary)",    direction: "O", amount: 270 },
  { id: 18, date: daysAgo(13), tag: "Commute Fare",     mainCategory: "TRANSIT",   description: "grab to meetup that was cancelled",  direction: "O", amount: 95 },
  { id: 19, date: daysAgo(12), tag: "Groceries",        mainCategory: "FOOD",      description: "16 jars of pickles, no reason",      direction: "O", amount: 290 },
  { id: 20, date: daysAgo(12), tag: "Leisure",          mainCategory: "LIFESTYLE", description: "coffee run, got lost for 2 hours",   direction: "O", amount: 160 },
  { id: 21, date: daysAgo(11), tag: "Consultation Fee", mainCategory: "HEALTH",    description: "dentist said teeth are 'concerning'", direction: "O", amount: 900 },
  { id: 22, date: daysAgo(11), tag: "Commute Fare",     mainCategory: "TRANSIT",   description: "taxi home, driver was a philosopher", direction: "O", amount: 180 },
  { id: 23, date: daysAgo(10), tag: "Dining",           mainCategory: "FOOD",      description: "pizza for one, cried a little",      direction: "O", amount: 410 },
  { id: 24, date: daysAgo(10), tag: "Leisure",          mainCategory: "LIFESTYLE", description: "board game night, no one won",       direction: "O", amount: 220 },
  // payday from a mysterious benefactor — 9 days ago
  { id: 25, date: daysAgo(9),  tag: "HOUSING",          mainCategory: "HOUSING",   description: "payment from mysterious benefactor", direction: "I", amount: 4000 },
  { id: 26, date: daysAgo(9),  tag: "FOOD",             mainCategory: "FOOD",      description: "payment from mysterious benefactor", direction: "I", amount: 8500 },
  { id: 27, date: daysAgo(9),  tag: "TRANSIT",          mainCategory: "TRANSIT",   description: "payment from mysterious benefactor", direction: "I", amount: 1500 },
  { id: 28, date: daysAgo(9),  tag: "HEALTH",           mainCategory: "HEALTH",    description: "payment from mysterious benefactor", direction: "I", amount: 2000 },
  { id: 29, date: daysAgo(9),  tag: "FINANCE",          mainCategory: "FINANCE",   description: "payment from mysterious benefactor", direction: "I", amount: 1000 },
  { id: 30, date: daysAgo(9),  tag: "LIFESTYLE",        mainCategory: "LIFESTYLE", description: "payment from mysterious benefactor", direction: "I", amount: 2500 },
  { id: 31, date: daysAgo(8),  tag: "Groceries",        mainCategory: "FOOD",      description: "groceries: just limes, all of them", direction: "O", amount: 850 },
  { id: 32, date: daysAgo(8),  tag: "Savings",          mainCategory: "FINANCE",   description: "savings (accidentally spent it)",    direction: "O", amount: 500 },
  // past week (days 7–0)
  { id: 33, date: daysAgo(7),  tag: "Dining",           mainCategory: "FOOD",      description: "breakfast: cereal with orange juice", direction: "O", amount: 250 },
  { id: 34, date: daysAgo(7),  tag: "Leisure",          mainCategory: "LIFESTYLE", description: "bought 3 plants, all already dead",  direction: "O", amount: 150 },
  { id: 35, date: daysAgo(7),  tag: "Clothing",         mainCategory: "LIFESTYLE", description: "shirt that says FAKE DATA on it",    direction: "O", amount: 1998 },
  { id: 36, date: daysAgo(7),  tag: "Uniform",          mainCategory: "MISC",      description: "wizard costume for the office",      direction: "O", amount: 1500 },
  { id: 37, date: daysAgo(7),  tag: "Commute Fare",     mainCategory: "TRANSIT",   description: "grab home, arrived at wrong home",   direction: "O", amount: 350 },
  { id: 38, date: daysAgo(5),  tag: "Groceries",        mainCategory: "FOOD",      description: "emergency crouton restock",          direction: "O", amount: 380 },
  { id: 39, date: daysAgo(5),  tag: "Commute Fare",     mainCategory: "TRANSIT",   description: "bus to office (test data)",          direction: "O", amount: 55 },
  { id: 40, date: daysAgo(4),  tag: "Dining",           mainCategory: "FOOD",      description: "lunch: mystery meat, no questions",  direction: "O", amount: 210 },
  { id: 41, date: daysAgo(4),  tag: "Pharmacy",         mainCategory: "HEALTH",    description: "ointment for unspecified condition",  direction: "O", amount: 145 },
  { id: 42, date: daysAgo(3),  tag: "Fuel",             mainCategory: "TRANSIT",   description: "refueled the horse again",           direction: "O", amount: 500 },
  { id: 43, date: daysAgo(3),  tag: "Leisure",          mainCategory: "LIFESTYLE", description: "paid to not go to a party",          direction: "O", amount: 169 },
  { id: 44, date: daysAgo(2),  tag: "Dining",           mainCategory: "FOOD",      description: "dinner: cereal again (different bowl)", direction: "O", amount: 320 },
  { id: 45, date: daysAgo(2),  tag: "Commute Fare",     mainCategory: "TRANSIT",   description: "grabbed home, correct home this time", direction: "O", amount: 85 },
  { id: 46, date: daysAgo(1),  tag: "Groceries",        mainCategory: "FOOD",      description: "full cart, forgot what I needed",    direction: "O", amount: 640 },
  { id: 47, date: daysAgo(1),  tag: "Utilities",        mainCategory: "HOUSING",   description: "internet bill (for the haunting)",   direction: "O", amount: 999 },
  { id: 48, date: daysAgo(0),  tag: "Dining",           mainCategory: "FOOD",      description: "THIS IS MOCK DATA — bon appétit",    direction: "O", amount: 120 },
  { id: 49, date: daysAgo(0),  tag: "Commute Fare",     mainCategory: "TRANSIT",   description: "THIS IS MOCK DATA — safe travels",   direction: "O", amount: 55 },
];

export function mockGetEntries(): Promise<Entry[]> {
  return Promise.resolve([...entries]);
}

export function mockGetCategories(): Promise<import("./types").CategoryMap> {
  return Promise.resolve(structuredClone(CATEGORY_MAP));
}

export function mockGetMaster(): Promise<MasterRow> {
  const totalIn = entries.filter(e => e.direction === "I").reduce((s, e) => s + e.amount, 0);
  const totalOut = entries.filter(e => e.direction === "O").reduce((s, e) => s + e.amount, 0);
  const budgets: Record<string, number> = {};
  for (const cat of Object.keys(CATEGORY_MAP)) {
    const inc = entries.filter(e => e.direction === "I" && e.mainCategory === cat).reduce((s, e) => s + e.amount, 0);
    const out = entries.filter(e => e.direction === "O" && e.mainCategory === cat).reduce((s, e) => s + e.amount, 0);
    budgets[cat] = inc - out;
  }
  return Promise.resolve({ onHand: totalIn - totalOut, budgets });
}

export function mockAddEntry(payload: AddEntryPayload): Promise<Entry> {
  const nextId = entries.reduce((max, e) => Math.max(max, e.id), 0) + 1;
  const entry = buildEntry(nextId, payload, CATEGORY_MAP);
  entries = [...entries, entry];
  return Promise.resolve(entry);
}

/** Assigns a contiguous id block in array order, mirroring the real addEntries contract. */
export function mockAddEntries(payloads: AddEntryPayload[]): Promise<Entry[]> {
  let nextId = entries.reduce((max, e) => Math.max(max, e.id), 0) + 1;
  const newEntries = payloads.map((payload) => buildEntry(nextId++, payload, CATEGORY_MAP));
  entries = [...entries, ...newEntries];
  return Promise.resolve(newEntries);
}

export function mockUpdateEntry(id: number, patch: UpdateEntryPatch): Promise<void> {
  entries = entries.map(e => {
    if (e.id !== id) return e;
    const updated = { ...e, ...patch };
    if (patch.tag) updated.mainCategory = getMainCategory(patch.tag, CATEGORY_MAP);
    return updated;
  });
  return Promise.resolve();
}

export function mockDeleteEntry(id: number): Promise<void> {
  entries = entries.filter(e => e.id !== id);
  return Promise.resolve();
}

export function mockGetConfig(): Promise<Config> {
  return Promise.resolve({ currency: "₱" });
}

// ---------------------------------------------------------------------------
// mockGetStats — client-side stand-in for the STATS sheet's formulas
// (docs/adr/0011). This is Mock-Mode-only: there is no real GAS backend to
// hit, so (like mockGetMaster above) this recomputes what the sheet would
// have produced. It is NOT a precedent for computing stats client-side
// against a real Connection — RealAdapter.getStats() only ever reads.
// ---------------------------------------------------------------------------

function monthKey(date: string): string {
  return date.slice(0, 7); // "YYYY-MM"
}

function dayOfMonth(date: string): number {
  return Number(date.slice(8, 10));
}

function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12 + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

function daysInMonth(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

const STATS_TRAILING_MONTHS = 3;

// #132 rolling-window stand-ins — trailing back from today, capped at ~1
// year (STATS_WINDOWS below). Same Mock-Mode-only caveat as the rest of this
// section: RealAdapter.getStats() never computes, only reads.
const STATS_WINDOWS: StatsWindow[] = ["30d", "3mo", "12mo"];

function dateStr(y: number, m: number, d: number): string {
  const date = new Date(y, m - 1, d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Inclusive start date for a rolling window, trailing back from today(). */
function windowStart(window: StatsWindow): string {
  const [y, m, d] = today().split('-').map(Number);
  if (window === "30d") return dateStr(y, m, d - 30);
  const monthsBack = window === "3mo" ? 3 : 12;
  return dateStr(y, m - monthsBack, d);
}

export function mockGetStats(): Promise<StatsData> {
  const currentMonth = monthKey(today());
  const todayDay = dayOfMonth(today());

  const categoryMonthChange: CategoryMonthChange[] = Object.keys(CATEGORY_MAP).map((category) => {
    const incoming = entries
      .filter(e => e.direction === "I" && e.mainCategory === category && monthKey(e.date) === currentMonth)
      .reduce((s, e) => s + e.amount, 0);
    const outgoing = entries
      .filter(e => e.direction === "O" && e.mainCategory === category && monthKey(e.date) === currentMonth)
      .reduce((s, e) => s + e.amount, 0);
    return { category, incoming, outgoing, netChange: incoming - outgoing };
  });

  const daysThisMonth = daysInMonth(currentMonth);
  const spendingPace: SpendingPaceDay[] = [];
  for (let day = 1; day <= daysThisMonth; day++) {
    const cumulativeThisMonth = day > todayDay ? 0 : entries
      .filter(e => e.direction === "O" && monthKey(e.date) === currentMonth && dayOfMonth(e.date) <= day)
      .reduce((s, e) => s + e.amount, 0);

    let trailingTotal = 0;
    for (let m = 1; m <= STATS_TRAILING_MONTHS; m++) {
      const key = shiftMonthKey(currentMonth, -m);
      trailingTotal += entries
        .filter(e => e.direction === "O" && monthKey(e.date) === key && dayOfMonth(e.date) <= day)
        .reduce((s, e) => s + e.amount, 0);
    }
    const cumulativeUsual = trailingTotal / STATS_TRAILING_MONTHS;

    spendingPace.push({ day, cumulativeThisMonth, cumulativeUsual });
  }

  const todayStr = today();
  const windowTotals: WindowTotal[] = STATS_WINDOWS.map((window) => {
    const start = windowStart(window);
    const inWindow = entries.filter(e => e.date >= start && e.date <= todayStr);
    const incoming = inWindow.filter(e => e.direction === "I").reduce((s, e) => s + e.amount, 0);
    const outgoing = inWindow.filter(e => e.direction === "O").reduce((s, e) => s + e.amount, 0);
    return { window, incoming, outgoing, net: incoming - outgoing };
  });

  const windowCategorySpend: WindowCategorySpend[] = STATS_WINDOWS.flatMap((window) => {
    const start = windowStart(window);
    return Object.keys(CATEGORY_MAP).map((category) => {
      const outgoing = entries
        .filter(e => e.direction === "O" && e.mainCategory === category && e.date >= start && e.date <= todayStr)
        .reduce((s, e) => s + e.amount, 0);
      return { window, category, outgoing };
    });
  });

  return Promise.resolve({ categoryMonthChange, spendingPace, windowTotals, windowCategorySpend });
}
