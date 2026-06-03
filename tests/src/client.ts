export type Direction = "I" | "O";

export interface Entry {
  id: number;
  date: string;
  tag: string;
  mainCategory: string;
  description: string;
  direction: Direction;
  amount: number;
}

export interface AddEntryPayload {
  date: string;
  tag: string;
  description: string;
  direction: Direction;
  amount: number;
}

export type CategoryMap = Record<string, string[]>;

export type ConfigMap = Record<string, string>;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export class GasClient {
  private readonly url: string;
  private readonly secret: string;

  constructor(url = requireEnv("GAS_URL"), secret = requireEnv("API_SECRET")) {
    this.url = url;
    this.secret = secret;
  }

  private async post<T>(body: Record<string, unknown>): Promise<T> {
    const res = await fetch(this.url, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ ...body, secret: this.secret }),
    });
    const text = await res.text();
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`Non-JSON response (HTTP ${res.status}): ${text.slice(0, 200)}`);
    }
    if (json.error) throw new Error(String(json.error));
    return json as T;
  }

  async getEntries(): Promise<Entry[]> {
    const data = await this.post<{ entries: Entry[] }>({ action: "getEntries" });
    return data.entries;
  }

  async getCategories(): Promise<CategoryMap> {
    const data = await this.post<{ categories: CategoryMap }>({ action: "getCategories" });
    return data.categories;
  }

  async getConfig(): Promise<ConfigMap> {
    const data = await this.post<{ config: ConfigMap }>({ action: "getConfig" });
    return data.config;
  }

  async addEntry(payload: AddEntryPayload): Promise<Entry> {
    const data = await this.post<{ ok: boolean; entry: Entry }>({
      action: "addEntry",
      ...payload,
    });
    return data.entry;
  }

  async deleteEntry(id: number): Promise<void> {
    await this.post<{ ok: boolean }>({ action: "deleteEntry", id });
  }
}
