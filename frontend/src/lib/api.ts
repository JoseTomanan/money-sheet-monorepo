import type {
  Entry,
  MasterRow,
  CategoryMap,
  SubcategoryBreakdown,
  AddEntryPayload,
  UpdateEntryPatch,
} from "./types";
import * as mock from "./mock";
import { normalizeDate } from "./format";

const GAS_URL = import.meta.env.VITE_GAS_URL as string;
const API_SECRET = import.meta.env.VITE_API_SECRET as string;

async function gasGet<T>(action: string): Promise<T> {
  const res = await fetch(`${GAS_URL}?action=${action}`, {
    mode: "cors",
    redirect: "follow",
  });
  const json = JSON.parse(await res.text()) as Record<string, unknown>;
  if (json.error) throw new Error(String(json.error));
  return json as T;
}

async function gasPost<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(GAS_URL, {
    method: "POST",
    mode: "cors",
    redirect: "follow",
    // text/plain avoids CORS preflight on GAS web apps
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ ...body, secret: API_SECRET }),
  });
  const json = JSON.parse(await res.text()) as Record<string, unknown>;
  if (json.error) throw new Error(String(json.error));
  return json as T;
}

export async function getEntries(): Promise<Entry[]> {
  if (mock.isMockMode) return mock.mockGetEntries();
  const data = await gasGet<{ entries: Entry[] }>("getEntries");
  return data.entries.map((e) => ({ ...e, date: normalizeDate(e.date) }));
}

export async function getMaster(): Promise<MasterRow> {
  if (mock.isMockMode) return mock.mockGetMaster();
  const data = await gasGet<{ master: MasterRow }>("getMaster");
  return data.master;
}

export async function getCategories(): Promise<CategoryMap> {
  if (mock.isMockMode) return mock.mockGetCategories();
  const data = await gasGet<{ categories: CategoryMap }>("getCategories");
  return data.categories;
}

export async function getSubcategoryBreakdown(): Promise<SubcategoryBreakdown> {
  if (mock.isMockMode) return mock.mockGetSubcategoryBreakdown();
  const data = await gasGet<{ breakdown: SubcategoryBreakdown }>(
    "getSubcategoryBreakdown"
  );
  return data.breakdown;
}

export async function addEntry(payload: AddEntryPayload): Promise<Entry> {
  if (mock.isMockMode) return mock.mockAddEntry(payload);
  const data = await gasPost<{ ok: boolean; entry: Entry }>({
    action: "addEntry",
    ...payload,
  });
  return data.entry;
}

export async function updateEntry(
  id: number,
  patch: UpdateEntryPatch
): Promise<void> {
  if (mock.isMockMode) return mock.mockUpdateEntry(id, patch);
  await gasPost({ action: "updateEntry", id, ...patch });
}

export async function deleteEntry(id: number): Promise<void> {
  if (mock.isMockMode) return mock.mockDeleteEntry(id);
  await gasPost({ action: "deleteEntry", id });
}
