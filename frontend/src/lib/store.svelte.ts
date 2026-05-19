import * as api from "./api";
import type {
  Entry,
  MasterRow,
  CategoryMap,
  SubcategoryBreakdown,
  AddEntryPayload,
  UpdateEntryPatch,
} from "./types";

let entries = $state<Entry[]>([]);
let master = $state<MasterRow>({ onHand: 0, budgets: {} });
let categories = $state<CategoryMap>({});
let breakdown = $state<SubcategoryBreakdown>({});
let loading = $state(false);
let error = $state<string | null>(null);

async function refreshAll(): Promise<void> {
  loading = true;
  error = null;
  try {
    const [e, m, c, b] = await Promise.all([
      api.getEntries(),
      api.getMaster(),
      api.getCategories(),
      api.getSubcategoryBreakdown(),
    ]);
    entries = e;
    master = m;
    categories = c;
    breakdown = b;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  } finally {
    loading = false;
  }
}

async function addEntry(payload: AddEntryPayload): Promise<void> {
  await api.addEntry(payload);
  await refreshAll();
}

async function updateEntry(id: number, patch: UpdateEntryPatch): Promise<void> {
  await api.updateEntry(id, patch);
  await refreshAll();
}

async function deleteEntry(id: number): Promise<void> {
  await api.deleteEntry(id);
  await refreshAll();
}

export const store = {
  get entries() { return entries; },
  get master() { return master; },
  get categories() { return categories; },
  get breakdown() { return breakdown; },
  get loading() { return loading; },
  get error() { return error; },
  refreshAll,
  addEntry,
  updateEntry,
  deleteEntry,
};
