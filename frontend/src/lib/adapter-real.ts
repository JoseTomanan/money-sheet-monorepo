import type {
  Connection,
  Entry,
  MasterRow,
  CategoryMap,
  Config,
  AddEntryPayload,
  UpdateEntryPatch,
  GatewayAdapter,
} from "./types";
import { normalizeDate } from "./format";
import { dedupeEntries } from "./dedupe";

export class ConnectionError extends Error {}
export class ConnectionMissingError extends ConnectionError {}
export class UnauthorizedError extends ConnectionError {}

type ConnectionSource = () => Connection | null;

const DEFAULT_CONFIG: Config = { currency: "₱" };

export class RealAdapter implements GatewayAdapter {
  constructor(private readonly getConnection: ConnectionSource) {}

  // Single deep helper — owns the fetch→parse→error-taxonomy protocol.
  private async gasRequest<T>(
    init: RequestInit & { url: string },
    opts: { tolerateUnknownAction?: boolean } = {},
  ): Promise<T> {
    let res: Response;
    try {
      const { url, ...fetchInit } = init;
      res = await fetch(url, fetchInit);
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

  async addEntry(payload: AddEntryPayload): Promise<Entry> {
    const data = await this.gasPost<{ ok: boolean; entry: Entry }>({
      action: "addEntry",
      ...payload,
    });
    return data.entry;
  }

  async updateEntry(id: number, patch: UpdateEntryPatch): Promise<void> {
    await this.gasPost({ action: "updateEntry", id, ...patch });
  }

  async deleteEntry(id: number): Promise<void> {
    await this.gasPost({ action: "deleteEntry", id });
  }
}
