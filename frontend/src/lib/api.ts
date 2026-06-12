import type {
  Entry,
  MasterRow,
  CategoryMap,
  Config,
  AddEntryPayload,
  UpdateEntryPatch,
} from "./types";
import * as mock from "./mock";
import { normalizeDate } from "./format";
import { connection } from "./connection.svelte";
import { dedupeEntries } from "./dedupe";

export class ConnectionError extends Error {}
export class ConnectionMissingError extends ConnectionError {}
export class UnauthorizedError extends ConnectionError {}

async function gasGet<T>(action: string): Promise<T> {
  const conn = connection.current;
  if (!conn) throw new ConnectionMissingError("No Connection configured.");
  let res: Response;
  try {
    res = await fetch(`${conn.gasUrl}?action=${action}&t=${Date.now()}`, {
      mode: "cors",
      redirect: "follow",
      cache: "no-store",
    });
  } catch (e) {
    throw new ConnectionError(e instanceof Error ? e.message : String(e));
  }
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(await res.text()) as Record<string, unknown>;
  } catch {
    throw new ConnectionError("Response was not valid JSON — check your GAS URL.");
  }
  if (json.error === "unauthorized") throw new UnauthorizedError("Secret rejected — your API secret doesn't match this spreadsheet's deployment. Check Settings.");
  if (json.error) throw new Error(String(json.error));
  return json as T;
}

async function gasPost<T>(body: Record<string, unknown>): Promise<T> {
  const conn = connection.current;
  if (!conn) throw new ConnectionMissingError("No Connection configured.");
  let res: Response;
  try {
    res = await fetch(conn.gasUrl, {
      method: "POST",
      mode: "cors",
      redirect: "follow",
      // text/plain avoids CORS preflight on GAS web apps
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ ...body, secret: conn.apiSecret }),
    });
  } catch (e) {
    throw new ConnectionError(e instanceof Error ? e.message : String(e));
  }
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(await res.text()) as Record<string, unknown>;
  } catch {
    throw new ConnectionError("Response was not valid JSON — check your GAS URL.");
  }
  if (json.error === "unauthorized") throw new UnauthorizedError("Secret rejected — your API secret doesn't match this spreadsheet's deployment. Check Settings.");
  if (json.error) throw new Error(String(json.error));
  return json as T;
}

export async function validateConnection(gasUrl: string, apiSecret: string): Promise<void> {
  if (mock.isMockMode) return;
  let res: Response;
  try {
    res = await fetch(gasUrl, {
      method: "POST",
      mode: "cors",
      redirect: "follow",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "validate", secret: apiSecret }),
    });
  } catch (e) {
    throw new ConnectionError(e instanceof Error ? e.message : String(e));
  }
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(await res.text()) as Record<string, unknown>;
  } catch {
    throw new ConnectionError("Response was not valid JSON — check your GAS URL.");
  }
  if (json.error === "unauthorized") throw new UnauthorizedError("Secret rejected — your API secret doesn't match this spreadsheet's deployment. Check Settings.");
  // "unknown action" means the secret passed the auth gate on an older deployment — treat as valid.
  if (json.error && json.error !== "unknown action") throw new Error(String(json.error));
}

export async function getEntries(): Promise<Entry[]> {
  if (mock.isMockMode) return mock.mockGetEntries();
  const data = await gasGet<{ entries: Entry[] }>("getEntries");
  return dedupeEntries(data.entries.map((e) => ({ ...e, date: normalizeDate(e.date) })));
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

const DEFAULT_CONFIG: Config = { currency: "₱" };

export async function getConfig(): Promise<Config> {
  if (mock.isMockMode) return mock.mockGetConfig();
  try {
    const data = await gasGet<{ config: Record<string, string> }>("getConfig");
    // Fall back to default if the currency key is absent
    return { ...DEFAULT_CONFIG, ...data.config };
  } catch {
    return DEFAULT_CONFIG;
  }
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
