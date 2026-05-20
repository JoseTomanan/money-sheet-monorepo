import type {
  Entry,
  MasterRow,
  CategoryMap,
  SubcategoryBreakdown,
  AddEntryPayload,
  UpdateEntryPatch,
} from "./types";

export const isMockMode = import.meta.env.VITE_MOCK === "true";

const CATEGORIES: CategoryMap = {
  HOUSING: ["Rent", "Utilities"],
  FOOD: ["Dining", "Groceries"],
  TRANSIT: ["Commute Fare", "Fuel"],
  HEALTH: ["Pharmacy", "Checkup"],
  FINANCE: ["Savings", "Fees"],
  LIFESTYLE: ["Leisure", "Clothing", "Uniform"],
  MISC: ["Other"],
};

// Subcategory → parent Category lookup
const SUB_TO_CAT: Record<string, string> = {};
for (const [cat, subs] of Object.entries(CATEGORIES)) {
  for (const sub of subs) SUB_TO_CAT[sub] = cat;
}

let entries: Entry[] = [
  { id: 1, date: "2026-05-17", tag: "HOUSING", mainCategory: "HOUSING", description: "internship payday!", direction: "I", amount: 4000 },
  { id: 2, date: "2026-05-17", tag: "FOOD",    mainCategory: "FOOD",    description: "internship payday!", direction: "I", amount: 8500 },
  { id: 3, date: "2026-05-17", tag: "TRANSIT", mainCategory: "TRANSIT", description: "internship payday!", direction: "I", amount: 1500 },
  { id: 4, date: "2026-05-17", tag: "HEALTH",  mainCategory: "HEALTH",  description: "internship payday!", direction: "I", amount: 2000 },
  { id: 5, date: "2026-05-17", tag: "FINANCE", mainCategory: "FINANCE", description: "internship payday!", direction: "I", amount: 1000 },
  { id: 6, date: "2026-05-17", tag: "LIFESTYLE", mainCategory: "LIFESTYLE", description: "internship payday!", direction: "I", amount: 2500 },
  { id: 7, date: "2026-05-19", tag: "Dining",      mainCategory: "FOOD",      description: "breakfast at nonos",          direction: "O", amount: 250 },
  { id: 8, date: "2026-05-19", tag: "Leisure",     mainCategory: "LIFESTYLE", description: "coffee from lunar",           direction: "O", amount: 150 },
  { id: 9, date: "2026-05-19", tag: "Clothing",    mainCategory: "LIFESTYLE", description: "new clothes from mango",      direction: "O", amount: 1998 },
  { id: 10, date: "2026-05-19", tag: "Uniform",    mainCategory: "LIFESTYLE", description: "polo shirt from company",     direction: "O", amount: 1500 },
  { id: 11, date: "2026-05-19", tag: "Commute Fare", mainCategory: "TRANSIT", description: "grab to Home",               direction: "O", amount: 350 },
];

export function mockGetEntries(): Promise<Entry[]> {
  return Promise.resolve([...entries]);
}

export function mockGetCategories(): Promise<CategoryMap> {
  return Promise.resolve(structuredClone(CATEGORIES));
}

export function mockGetMaster(): Promise<MasterRow> {
  const totalIn = entries.filter(e => e.direction === "I").reduce((s, e) => s + e.amount, 0);
  const totalOut = entries.filter(e => e.direction === "O").reduce((s, e) => s + e.amount, 0);
  const budgets: Record<string, number> = {};
  for (const cat of Object.keys(CATEGORIES)) {
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
  const mainCategory = SUB_TO_CAT[payload.tag] ?? payload.tag;
  const entry: Entry = { id: nextId, mainCategory, ...payload };
  entries = [...entries, entry];
  return Promise.resolve(entry);
}

export function mockUpdateEntry(id: number, patch: UpdateEntryPatch): Promise<void> {
  entries = entries.map(e => {
    if (e.id !== id) return e;
    const updated = { ...e, ...patch };
    if (patch.tag) updated.mainCategory = SUB_TO_CAT[patch.tag] ?? patch.tag;
    return updated;
  });
  return Promise.resolve();
}

export function mockDeleteEntry(id: number): Promise<void> {
  entries = entries.filter(e => e.id !== id);
  return Promise.resolve();
}
