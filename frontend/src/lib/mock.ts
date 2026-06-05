import type {
  Entry,
  MasterRow,
  Config,
  AddEntryPayload,
  UpdateEntryPatch,
} from "./types";
import { CATEGORY_MAP } from "./theme";
import { buildEntry, getMainCategory } from "./domain";

export const isMockMode = import.meta.env.VITE_MOCK === "true";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

let entries: Entry[] = [
  // 3 weeks ago (days 20–15)
  { id: 1,  date: daysAgo(20), tag: "Groceries",        mainCategory: "FOOD",      description: "weekly grocery run",        direction: "O", amount: 720 },
  { id: 2,  date: daysAgo(20), tag: "Commute Fare",     mainCategory: "TRANSIT",   description: "jeepney fare to uni",       direction: "O", amount: 40 },
  { id: 3,  date: daysAgo(19), tag: "Dining",           mainCategory: "FOOD",      description: "lunch with friends",        direction: "O", amount: 185 },
  { id: 4,  date: daysAgo(19), tag: "Leisure",          mainCategory: "LIFESTYLE", description: "movie ticket",              direction: "O", amount: 300 },
  { id: 5,  date: daysAgo(18), tag: "Commute Fare",     mainCategory: "TRANSIT",   description: "grab to office",            direction: "O", amount: 130 },
  { id: 6,  date: daysAgo(18), tag: "Dining",           mainCategory: "FOOD",      description: "merienda at 7/11",          direction: "O", amount: 75 },
  { id: 7,  date: daysAgo(18), tag: "Pharmacy",         mainCategory: "HEALTH",    description: "vitamins",                  direction: "O", amount: 250 },
  { id: 8,  date: daysAgo(17), tag: "Fuel",             mainCategory: "TRANSIT",   description: "gas fill-up",               direction: "O", amount: 800 },
  { id: 9,  date: daysAgo(17), tag: "Dining",           mainCategory: "FOOD",      description: "dinner at home base",       direction: "O", amount: 220 },
  { id: 10, date: daysAgo(16), tag: "Groceries",        mainCategory: "FOOD",      description: "fresh produce restock",     direction: "O", amount: 430 },
  { id: 11, date: daysAgo(16), tag: "Leisure",          mainCategory: "LIFESTYLE", description: "netflix subscription",      direction: "O", amount: 199 },
  // weekly allowance — 15 days ago
  { id: 12, date: daysAgo(15), tag: "FOOD",             mainCategory: "FOOD",      description: "weekly allowance",          direction: "I", amount: 1500 },
  { id: 13, date: daysAgo(15), tag: "TRANSIT",          mainCategory: "TRANSIT",   description: "weekly allowance",          direction: "I", amount: 500 },
  { id: 14, date: daysAgo(15), tag: "Dining",           mainCategory: "FOOD",      description: "sunday brunch",             direction: "O", amount: 340 },
  // 2 weeks ago (days 14–8)
  { id: 15, date: daysAgo(14), tag: "Commute Fare",     mainCategory: "TRANSIT",   description: "bus fare back home",        direction: "O", amount: 60 },
  { id: 16, date: daysAgo(14), tag: "Utilities",        mainCategory: "HOUSING",   description: "electric bill share",       direction: "O", amount: 650 },
  { id: 17, date: daysAgo(13), tag: "Dining",           mainCategory: "FOOD",      description: "team lunch",                direction: "O", amount: 270 },
  { id: 18, date: daysAgo(13), tag: "Commute Fare",     mainCategory: "TRANSIT",   description: "grab to meetup",            direction: "O", amount: 95 },
  { id: 19, date: daysAgo(12), tag: "Groceries",        mainCategory: "FOOD",      description: "midweek snack restock",     direction: "O", amount: 290 },
  { id: 20, date: daysAgo(12), tag: "Leisure",          mainCategory: "LIFESTYLE", description: "coffee run with coworker",  direction: "O", amount: 160 },
  { id: 21, date: daysAgo(11), tag: "Consultation Fee", mainCategory: "HEALTH",    description: "dental cleaning",           direction: "O", amount: 900 },
  { id: 22, date: daysAgo(11), tag: "Commute Fare",     mainCategory: "TRANSIT",   description: "taxi back from clinic",     direction: "O", amount: 180 },
  { id: 23, date: daysAgo(10), tag: "Dining",           mainCategory: "FOOD",      description: "friday pizza",              direction: "O", amount: 410 },
  { id: 24, date: daysAgo(10), tag: "Leisure",          mainCategory: "LIFESTYLE", description: "board game night snacks",   direction: "O", amount: 220 },
  // internship payday — 9 days ago
  { id: 25, date: daysAgo(9),  tag: "HOUSING",          mainCategory: "HOUSING",   description: "internship payday!",        direction: "I", amount: 4000 },
  { id: 26, date: daysAgo(9),  tag: "FOOD",             mainCategory: "FOOD",      description: "internship payday!",        direction: "I", amount: 8500 },
  { id: 27, date: daysAgo(9),  tag: "TRANSIT",          mainCategory: "TRANSIT",   description: "internship payday!",        direction: "I", amount: 1500 },
  { id: 28, date: daysAgo(9),  tag: "HEALTH",           mainCategory: "HEALTH",    description: "internship payday!",        direction: "I", amount: 2000 },
  { id: 29, date: daysAgo(9),  tag: "FINANCE",          mainCategory: "FINANCE",   description: "internship payday!",        direction: "I", amount: 1000 },
  { id: 30, date: daysAgo(9),  tag: "LIFESTYLE",        mainCategory: "LIFESTYLE", description: "internship payday!",        direction: "I", amount: 2500 },
  { id: 31, date: daysAgo(8),  tag: "Groceries",        mainCategory: "FOOD",      description: "weekend grocery haul",      direction: "O", amount: 850 },
  { id: 32, date: daysAgo(8),  tag: "Savings",          mainCategory: "FINANCE",   description: "monthly savings transfer",  direction: "O", amount: 500 },
  // past week (days 7–0)
  { id: 33, date: daysAgo(7),  tag: "Dining",           mainCategory: "FOOD",      description: "breakfast at nonos",        direction: "O", amount: 250 },
  { id: 34, date: daysAgo(7),  tag: "Leisure",          mainCategory: "LIFESTYLE", description: "coffee from lunar",         direction: "O", amount: 150 },
  { id: 35, date: daysAgo(7),  tag: "Clothing",         mainCategory: "LIFESTYLE", description: "new clothes from mango",    direction: "O", amount: 1998 },
  { id: 36, date: daysAgo(7),  tag: "Uniform",          mainCategory: "MISC",      description: "polo shirt from company",   direction: "O", amount: 1500 },
  { id: 37, date: daysAgo(7),  tag: "Commute Fare",     mainCategory: "TRANSIT",   description: "grab to home",              direction: "O", amount: 350 },
  { id: 38, date: daysAgo(5),  tag: "Groceries",        mainCategory: "FOOD",      description: "midweek grocery top-up",    direction: "O", amount: 380 },
  { id: 39, date: daysAgo(5),  tag: "Commute Fare",     mainCategory: "TRANSIT",   description: "bus to office",             direction: "O", amount: 55 },
  { id: 40, date: daysAgo(4),  tag: "Dining",           mainCategory: "FOOD",      description: "lunch with workmates",      direction: "O", amount: 210 },
  { id: 41, date: daysAgo(4),  tag: "Pharmacy",         mainCategory: "HEALTH",    description: "cold medicine",             direction: "O", amount: 145 },
  { id: 42, date: daysAgo(3),  tag: "Fuel",             mainCategory: "TRANSIT",   description: "gas top-up",                direction: "O", amount: 500 },
  { id: 43, date: daysAgo(3),  tag: "Leisure",          mainCategory: "LIFESTYLE", description: "spotify renewal",           direction: "O", amount: 169 },
  { id: 44, date: daysAgo(2),  tag: "Dining",           mainCategory: "FOOD",      description: "dinner takeout",            direction: "O", amount: 320 },
  { id: 45, date: daysAgo(2),  tag: "Commute Fare",     mainCategory: "TRANSIT",   description: "grab home from dinner",     direction: "O", amount: 85 },
  { id: 46, date: daysAgo(1),  tag: "Groceries",        mainCategory: "FOOD",      description: "weekend haul",              direction: "O", amount: 640 },
  { id: 47, date: daysAgo(1),  tag: "Utilities",        mainCategory: "HOUSING",   description: "internet bill",             direction: "O", amount: 999 },
  { id: 48, date: daysAgo(0),  tag: "Dining",           mainCategory: "FOOD",      description: "monday breakfast",          direction: "O", amount: 120 },
  { id: 49, date: daysAgo(0),  tag: "Commute Fare",     mainCategory: "TRANSIT",   description: "bus to office",             direction: "O", amount: 55 },
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
