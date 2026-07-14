import type {
  Connection,
  Entry,
  MasterRow,
  CategoryMap,
  Config,
  StatsData,
  AddEntryPayload,
  UpdateEntryPatch,
  GatewayAdapter,
} from "./types";
import { normalizeDate } from "./format";
import { dedupeEntries } from "./dedupe";

export class ConnectionError extends Error {}
export class ConnectionMissingError extends ConnectionError {}
export class UnauthorizedError extends ConnectionError {}

// ---------------------------------------------------------------------------
// Semantic interface — the only vocabulary callers above this module should
// use to interpret an adapter failure. Nothing outside this file should do
// `instanceof ConnectionError` / `instanceof UnauthorizedError` directly.
// ---------------------------------------------------------------------------

/** Should this mutation go to the Offline Queue rather than fail outright? */
export function isQueueable(err: unknown): boolean {
  return err instanceof ConnectionError;
}

/** Was this failure specifically a rejected/mismatched API secret? */
export function isAuthError(err: unknown): boolean {
  return err instanceof UnauthorizedError;
}

/** What should the user read for this failure? */
export function userMessage(err: unknown): string {
  if (isAuthError(err)) {
    return "Secret rejected — make sure the secret and the GAS URL are from the same copy of the sheet.";
  }
  if (isQueueable(err)) {
    return "Couldn't reach that URL — check the GAS web-app URL and try again.";
  }
  return "Something went wrong. Check the URL and secret and try again.";
}

type ConnectionSource = () => Connection | null;

const DEFAULT_CONFIG: Config = { currency: "₱" };
const REQUEST_TIMEOUT_MS = 15_000;

export class RealAdapter implements GatewayAdapter {
  constructor(private readonly getConnection: ConnectionSource) {}

  // Races a fetch against a timeout so every request self-limits — callers
  // never need their own timeout wrapper.
  private fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ConnectionError("Request timed out.")), REQUEST_TIMEOUT_MS);
    });
    return Promise.race([fetch(url, init), timeout]).finally(() => clearTimeout(timer));
  }

  // Single deep helper — owns the fetch→parse→error-taxonomy protocol.
  private async gasRequest<T>(
    init: RequestInit & { url: string },
    opts: { tolerateUnknownAction?: boolean } = {},
  ): Promise<T> {
    let res: Response;
    try {
      const { url, ...fetchInit } = init;
      res = await this.fetchWithTimeout(url, fetchInit);
    } catch (e) {
      throw new ConnectionError(e instanceof Error ? e.message : String(e));
    }
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(await res.text()) as Record<string, unknown>;
    } catch {
      throw new ConnectionError("Response was not valid JSON — check your GAS URL.");
    }
    if (json.error === "unauthorized") {
      throw new UnauthorizedError("Secret rejected — your API secret doesn't match this spreadsheet's deployment. Check Settings.");
    }
    if (json.error && !(opts.tolerateUnknownAction && json.error === "unknown action")) {
      throw new Error(String(json.error));
    }
    return json as T;
  }

  private async gasGet<T>(action: string): Promise<T> {
    const conn = this.getConnection();
    if (!conn) throw new ConnectionMissingError("No Connection configured.");
    return this.gasRequest<T>({
      url: `${conn.gasUrl}?action=${action}&t=${Date.now()}`,
      mode: "cors",
      redirect: "follow",
      cache: "no-store",
    });
  }

  private async gasPost<T>(body: Record<string, unknown>): Promise<T> {
    const conn = this.getConnection();
    if (!conn) throw new ConnectionMissingError("No Connection configured.");
    return this.gasRequest<T>({
      url: conn.gasUrl,
      method: "POST",
      mode: "cors",
      redirect: "follow",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ ...body, secret: conn.apiSecret }),
    });
  }

  async validateConnection(gasUrl: string, apiSecret: string): Promise<void> {
    await this.gasRequest({
      url: gasUrl,
      method: "POST",
      mode: "cors",
      redirect: "follow",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "validate", secret: apiSecret }),
    }, { tolerateUnknownAction: true });
  }

  async getEntries(): Promise<Entry[]> {
    const data = await this.gasGet<{ entries: Entry[] }>("getEntries");
    return dedupeEntries(data.entries.map((e) => ({ ...e, date: normalizeDate(e.date) })));
  }

  async getMaster(): Promise<MasterRow> {
    const data = await this.gasGet<{ master: MasterRow }>("getMaster");
    return data.master;
  }

  async getCategories(): Promise<CategoryMap> {
    const data = await this.gasGet<{ categories: CategoryMap }>("getCategories");
    return data.categories;
  }

  async getConfig(): Promise<Config> {
    try {
      const data = await this.gasGet<{ config: Record<string, string> }>("getConfig");
      return { ...DEFAULT_CONFIG, ...data.config };
    } catch {
      return DEFAULT_CONFIG;
    }
  }

  async getStats(): Promise<StatsData> {
    const data = await this.gasGet<{ stats: StatsData }>("getStats");
    return data.stats;
  }

  async addEntry(payload: AddEntryPayload): Promise<Entry> {
    const data = await this.gasPost<{ ok: boolean; entry: Entry }>({
      action: "addEntry",
      ...payload,
    });
    return data.entry;
  }

  async addEntries(payloads: AddEntryPayload[]): Promise<Entry[]> {
    const data = await this.gasPost<{ ok: boolean; entries: Entry[] }>({
      action: "addEntries",
      entries: payloads,
    });
    return data.entries;
  }

  async updateEntry(id: number, patch: UpdateEntryPatch): Promise<void> {
    await this.gasPost({ action: "updateEntry", id, ...patch });
  }

  async deleteEntry(id: number): Promise<void> {
    await this.gasPost({ action: "deleteEntry", id });
  }
}
