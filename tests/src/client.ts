import { randomUUID } from "node:crypto";
import type {
  AddEntryPayload,
  AddEntryRequest,
  AddEntriesPayload,
  UpdateEntryPatch,
  ConfigMap,
  CategoryMonthChange,
  SpendingPaceDay,
  StatsWindow,
  WindowTotal,
  WindowCategorySpend,
  StatsData,
} from "../../clasp/src/lib/application/dispatch";
import type { Direction, Entry } from "../../clasp/src/lib/domain/entry";
import type { CategoryMap } from "../../clasp/src/lib/domain/category";

export type { Direction, Entry } from "../../clasp/src/lib/domain/entry";
export type { CategoryMap } from "../../clasp/src/lib/domain/category";
export type {
  AddEntryPayload,
  AddEntryRequest,
  AddEntriesPayload,
  UpdateEntryPatch,
  ConfigMap,
  CategoryMonthChange,
  SpendingPaceDay,
  StatsWindow,
  WindowTotal,
  WindowCategorySpend,
  StatsData,
} from "../../clasp/src/lib/application/dispatch";

const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 60_000;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export class GasClient {
  private readonly url: string;
  private readonly secret: string;

  constructor(
    url = requireEnv("DISPOSABLE_GAS_URL"),
    secret = requireEnv("DISPOSABLE_API_SECRET"),
  ) {
    this.url = url;
    this.secret = secret;
  }

  private async post<T>(body: Record<string, unknown>, retryTransient = false): Promise<T> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let res: Response;
      let text: string;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        res = await fetch(this.url, {
          method: "POST",
          redirect: "follow",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({ ...body, secret: this.secret }),
          signal: controller.signal,
        });
        text = await res.text();
      } catch (error) {
        const message = controller.signal.aborted
          ? "request timed out"
          : error instanceof Error ? error.message : String(error);
        if (retryTransient && attempt < MAX_ATTEMPTS) continue;
        if (retryTransient) {
          throw new Error(`${String(body.action)} failed after ${attempt} attempts: ${message}`);
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
      const transientStatus = res.status === 408 || res.status === 429 || res.status >= 500;
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        if (retryTransient && transientStatus && attempt < MAX_ATTEMPTS) continue;
        if (retryTransient && transientStatus) {
          throw new Error(
            `${String(body.action)} failed after ${attempt} attempts: HTTP ${res.status} non-JSON response`,
          );
        }
        throw new Error(`Non-JSON response (HTTP ${res.status})`);
      }
      const message = typeof json.message === "string" ? json.message : String(json.error ?? "");
      if (retryTransient && transientStatus && attempt < MAX_ATTEMPTS) continue;
      if (retryTransient && transientStatus) {
        throw new Error(
          `${String(body.action)} failed after ${attempt} attempts: HTTP ${res.status} ${message}`.trim(),
        );
      }
      if (
        retryTransient &&
        message === 'Unknown action: ""' &&
        attempt < MAX_ATTEMPTS
      ) {
        continue;
      }
      if (retryTransient && message === 'Unknown action: ""') {
        throw new Error(`${String(body.action)} failed after ${attempt} attempts: ${message}`);
      }
      if (json.error) throw new Error(message);
      return json as T;
    }
    throw new Error("Request retry limit exhausted");
  }

  async getEntries(): Promise<Entry[]> {
    const data = await this.post<{ entries: Entry[] }>({ action: "getEntries" }, true);
    return data.entries;
  }

  async getCategories(): Promise<CategoryMap> {
    const data = await this.post<{ categories: CategoryMap }>({ action: "getCategories" }, true);
    return data.categories;
  }

  async getConfig(): Promise<ConfigMap> {
    const data = await this.post<{ config: ConfigMap }>({ action: "getConfig" }, true);
    return data.config;
  }

  async getStats(): Promise<StatsData> {
    const data = await this.post<{ stats: StatsData }>({ action: "getStats" }, true);
    return data.stats;
  }

  async addEntry(
    payload: AddEntryPayload,
    mutationId: string = randomUUID(),
  ): Promise<Entry> {
    const request: AddEntryRequest = { ...payload, mutationId };
    const data = await this.post<{ ok: boolean; entry: Entry }>({
      action: "addEntry",
      ...request,
    }, true);
    return data.entry;
  }

  async addEntries(
    payloads: AddEntryPayload[],
    mutationId: string = randomUUID(),
  ): Promise<Entry[]> {
    const request: AddEntriesPayload = { entries: payloads, mutationId };
    const data = await this.post<{ ok: boolean; entries: Entry[] }>({
      action: "addEntries",
      ...request,
    }, true);
    return data.entries;
  }

  async deleteEntry(id: number): Promise<void> {
    await this.post<{ ok: boolean }>({ action: "deleteEntry", id });
  }
}
