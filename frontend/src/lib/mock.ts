import type {
  Entry,
  MasterRow,
  SubcategoryBreakdown,
  AddEntryPayload,
  UpdateEntryPatch,
} from "./types";
import { CATEGORY_MAP } from "./theme";
import { buildEntry, getMainCategory } from "./domain";

export const isMockMode = import.meta.env.VITE_MOCK === "true";

let entries: Entry[] = [
  // 2026-05-06
  { id: 1,  date: "2026-05-06", tag: "Groceries",   mainCategory: "FOOD",      description: "weekly grocery run",        direction: "O", amount: 720 },
  { id: 2,  date: "2026-05-06", tag: "Commute Fare", mainCategory: "TRANSIT",  description: "jeepney fare to uni",       direction: "O", amount: 40 },
  // 2026-05-07
  { id: 3,  date: "2026-05-07", tag: "Dining",       mainCategory: "FOOD",      description: "lunch with friends",        direction: "O", amount: 185 },
  { id: 4,  date: "2026-05-07", tag: "Leisure",      mainCategory: "LIFESTYLE", description: "movie ticket",              direction: "O", amount: 300 },
  // 2026-05-08
  { id: 5,  date: "2026-05-08", tag: "Commute Fare", mainCategory: "TRANSIT",  description: "grab to office",            direction: "O", amount: 130 },
  { id: 6,  date: "2026-05-08", tag: "Dining",       mainCategory: "FOOD",      description: "merienda at 7/11",          direction: "O", amount: 75 },
  { id: 7,  date: "2026-05-08", tag: "Pharmacy",     mainCategory: "HEALTH",    description: "vitamins",                  direction: "O", amount: 250 },
  // 2026-05-09
  { id: 8,  date: "2026-05-09", tag: "Fuel",         mainCategory: "TRANSIT",   description: "gas fill-up",              direction: "O", amount: 800 },
  { id: 9,  date: "2026-05-09", tag: "Dining",       mainCategory: "FOOD",      description: "dinner at home base",       direction: "O", amount: 220 },
  // 2026-05-10
  { id: 10, date: "2026-05-10", tag: "Groceries",    mainCategory: "FOOD",      description: "fresh produce restock",     direction: "O", amount: 430 },
  { id: 11, date: "2026-05-10", tag: "Leisure",      mainCategory: "LIFESTYLE", description: "netflix subscription",      direction: "O", amount: 199 },
  // 2026-05-11 — weekly allowance
  { id: 12, date: "2026-05-11", tag: "FOOD",         mainCategory: "FOOD",      description: "weekly allowance",          direction: "I", amount: 1500 },
  { id: 13, date: "2026-05-11", tag: "TRANSIT",      mainCategory: "TRANSIT",   description: "weekly allowance",          direction: "I", amount: 500 },
  { id: 14, date: "2026-05-11", tag: "Dining",       mainCategory: "FOOD",      description: "sunday brunch",             direction: "O", amount: 340 },
  // 2026-05-12
  { id: 15, date: "2026-05-12", tag: "Commute Fare", mainCategory: "TRANSIT",  description: "bus fare back home",         direction: "O", amount: 60 },
  { id: 16, date: "2026-05-12", tag: "Utilities",    mainCategory: "HOUSING",   description: "electric bill share",       direction: "O", amount: 650 },
  // 2026-05-13
  { id: 17, date: "2026-05-13", tag: "Dining",       mainCategory: "FOOD",      description: "team lunch",                direction: "O", amount: 270 },
  { id: 18, date: "2026-05-13", tag: "Commute Fare", mainCategory: "TRANSIT",  description: "grab to meetup",             direction: "O", amount: 95 },
  // 2026-05-14
  { id: 19, date: "2026-05-14", tag: "Groceries",    mainCategory: "FOOD",      description: "midweek snack restock",     direction: "O", amount: 290 },
  { id: 20, date: "2026-05-14", tag: "Leisure",      mainCategory: "LIFESTYLE", description: "coffee run with coworker",  direction: "O", amount: 160 },
  // 2026-05-15
  { id: 21, date: "2026-05-15", tag: "Consultation Fee", mainCategory: "HEALTH", description: "dental cleaning",           direction: "O", amount: 900 },
  { id: 22, date: "2026-05-15", tag: "Commute Fare", mainCategory: "TRANSIT",  description: "taxi back from clinic",      direction: "O", amount: 180 },
  // 2026-05-16
  { id: 23, date: "2026-05-16", tag: "Dining",       mainCategory: "FOOD",      description: "friday pizza",              direction: "O", amount: 410 },
  { id: 24, date: "2026-05-16", tag: "Leisure",      mainCategory: "LIFESTYLE", description: "board game night snacks",   direction: "O", amount: 220 },
  // 2026-05-17 — internship payday
  { id: 25, date: "2026-05-17", tag: "HOUSING",      mainCategory: "HOUSING",   description: "internship payday!",        direction: "I", amount: 4000 },
  { id: 26, date: "2026-05-17", tag: "FOOD",         mainCategory: "FOOD",      description: "internship payday!",        direction: "I", amount: 8500 },
  { id: 27, date: "2026-05-17", tag: "TRANSIT",      mainCategory: "TRANSIT",   description: "internship payday!",        direction: "I", amount: 1500 },
  { id: 28, date: "2026-05-17", tag: "HEALTH",       mainCategory: "HEALTH",    description: "internship payday!",        direction: "I", amount: 2000 },
  { id: 29, date: "2026-05-17", tag: "FINANCE",      mainCategory: "FINANCE",   description: "internship payday!",        direction: "I", amount: 1000 },
  { id: 30, date: "2026-05-17", tag: "LIFESTYLE",    mainCategory: "LIFESTYLE", description: "internship payday!",        direction: "I", amount: 2500 },
  // 2026-05-18
  { id: 31, date: "2026-05-18", tag: "Groceries",    mainCategory: "FOOD",      description: "weekend grocery haul",      direction: "O", amount: 850 },
  { id: 32, date: "2026-05-18", tag: "Savings",      mainCategory: "FINANCE",   description: "monthly savings transfer",  direction: "O", amount: 500 },
  // 2026-05-19
  { id: 33, date: "2026-05-19", tag: "Dining",       mainCategory: "FOOD",      description: "breakfast at nonos",        direction: "O", amount: 250 },
  { id: 34, date: "2026-05-19", tag: "Leisure",      mainCategory: "LIFESTYLE", description: "coffee from lunar",         direction: "O", amount: 150 },
  { id: 35, date: "2026-05-19", tag: "Clothing",     mainCategory: "LIFESTYLE", description: "new clothes from mango",    direction: "O", amount: 1998 },
  { id: 36, date: "2026-05-19", tag: "Uniform",      mainCategory: "MISC",      description: "polo shirt from company",   direction: "O", amount: 1500 },
  { id: 37, date: "2026-05-19", tag: "Commute Fare", mainCategory: "TRANSIT",  description: "grab to home",               direction: "O", amount: 350 },
  // 2026-05-20
  { id: 38, date: "2026-05-20", tag: "Dining",       mainCategory: "FOOD",      description: "monday breakfast",          direction: "O", amount: 120 },
  { id: 39, date: "2026-05-20", tag: "Commute Fare", mainCategory: "TRANSIT",  description: "bus to office",              direction: "O", amount: 55 },
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

export function mockGetSubcategoryBreakdown(): Promise<SubcategoryBreakdown> {
  const breakdown: SubcategoryBreakdown = {};
  for (const e of entries) {
    if (e.direction === "O") breakdown[e.tag] = (breakdown[e.tag] ?? 0) + e.amount;
  }
  return Promise.resolve(breakdown);
}

export function mockAddEntry(payload: AddEntryPayload): Promise<Entry> {
  const nextId = entries.reduce((max, e) => Math.max(max, e.id), 0) + 1;
  const entry = buildEntry(nextId, payload, CATEGORY_MAP);
  entries = [...entries, entry];
  return Promise.resolve(entry);
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
