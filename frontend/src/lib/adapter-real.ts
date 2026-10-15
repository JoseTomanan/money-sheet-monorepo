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
import { createMutationId } from "./mutationId";

const CONNECTION_FAILURE = Symbol.for('money-sheet.connection-failure');
const AUTH_FAILURE = Symbol.for('money-sheet.auth-failure');
export class ConnectionError extends Error { readonly [CONNECTION_FAILURE] = true; }
export class ConnectionMissingError extends ConnectionError {}
export class UnauthorizedError extends ConnectionError { readonly [AUTH_FAILURE] = true; }

// ---------------------------------------------------------------------------
// Semantic interface — the only vocabulary callers above this module should
// use to interpret an adapter failure. Nothing outside this file should do
// `instanceof ConnectionError` / `instanceof UnauthorizedError` directly.
// ---------------------------------------------------------------------------

/** Should this mutation go to the Offline Queue rather than fail outright? */
export function isQueueable(err: unknown): boolean {
  return err instanceof ConnectionError || !!(err && typeof err === 'object' && CONNECTION_FAILURE in err && err[CONNECTION_FAILURE]);
}

/** Was this failure specifically a rejected/mismatched API secret? */
export function isAuthError(err: unknown): boolean {
  return err instanceof UnauthorizedError || !!(err && typeof err === 'object' && AUTH_FAILURE in err && err[AUTH_FAILURE]);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function isEntry(value: unknown): value is Entry {
  return isRecord(value) && Number.isSafeInteger(value.id) && Number(value.id) > 0 &&
    typeof value.date === 'string' && isCalendarDate(normalizeDate(value.date)) &&
    typeof value.tag === 'string' && !!value.tag.trim() &&
    typeof value.mainCategory === 'string' && typeof value.description === 'string' &&
    (value.direction === 'I' || value.direction === 'O') &&
    typeof value.amount === 'number' && Number.isFinite(value.amount) &&
    (value.row === undefined || (Number.isSafeInteger(value.row) && Number(value.row) > 0));
}

function matchesPayload(entry: Entry, payload: AddEntryPayload): boolean {
  return normalizeDate(entry.date) === payload.date && entry.tag === payload.tag.trim() &&
    entry.description === payload.description && entry.direction === payload.direction && entry.amount === payload.amount;
}

function finiteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function recordOf(value: unknown, accepts: (value: unknown) => boolean): boolean {
  return isRecord(value) && Object.values(value).every(accepts);
}

function isStats(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const rows = (key: string, accepts: (row: Record<string, unknown>) => boolean) =>
    Array.isArray(value[key]) && value[key].every(row => isRecord(row) && accepts(row));
  const window = (value: unknown) => value === '30d' || value === '3mo' || value === '12mo';
  return rows('categoryMonthChange', row => typeof row.category === 'string' &&
    [row.incoming, row.outgoing, row.netChange].every(finiteNumber)) &&
    rows('spendingPace', row => Number.isInteger(row.day) && Number(row.day) >= 1 && Number(row.day) <= 31 &&
      [row.cumulativeThisMonth, row.cumulativeUsual].every(finiteNumber)) &&
    rows('windowTotals', row => window(row.window) && [row.incoming, row.outgoing, row.net].every(finiteNumber)) &&
    rows('windowCategorySpend', row => window(row.window) && typeof row.category === 'string' && finiteNumber(row.outgoing));
}

type ResponseOptions = {
  tolerateUnknownAction?: boolean;
  acknowledgment?: boolean;
  accepts?: (data: Record<string, unknown>) => boolean;
};

type ConnectionSource = () => Connection | null;

const DEFAULT_CONFIG: Config = { currency: "₱" };
export const REQUEST_TIMEOUT_MS = 15_000;

export class RealAdapter implements GatewayAdapter {
  constructor(private readonly getConnection: ConnectionSource) {}

  // Single deep helper — owns the fetch→parse→error-taxonomy protocol.
  private async parseRequest<T>(
    init: RequestInit & { url: string },
    opts: ResponseOptions = {},
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
    if (!json || typeof json !== "object" || Array.isArray(json) ||
        (json.ok !== undefined && typeof json.ok !== "boolean") ||
        ("code" in json && (json.ok !== false || typeof json.message !== 'string' || !json.message ||
          (json.error !== undefined && json.error !== (json.code === 'auth' ? 'unauthorized' : json.message)))) ||
        (json.ok === true && ("error" in json || "code" in json || "message" in json)) ||
        ((json.ok === false || "error" in json || "code" in json || (opts.acknowledgment && !opts.accepts)) &&
          ['entry', 'entries', 'master', 'categories', 'config', 'stats'].some(key => key in json))) {
      throw new ConnectionError("Malformed response; confirmation is unavailable.");
    }
    if (json.code === "auth" || json.error === "unauthorized") {
      throw new UnauthorizedError("Secret rejected — your API secret doesn't match this spreadsheet's deployment. Check Settings.");
    }
    // Only the exact legacy validate response is a compatibility success.
    const legacyValidate = opts.tolerateUnknownAction && json.ok === undefined &&
      json.code === undefined && json.error === "unknown action";
    if (!legacyValidate && (json.ok === false || "code" in json || "error" in json)) {
      const message = typeof json.message === "string" && json.message ? json.message :
        typeof json.error === "string" && json.error ? json.error : "Unrecognized error response.";
      if (json.code === "validation" || json.code === "not_found") throw new Error(message);
      // Older deployments expose only human text. Recognize established rejection
      // vocabulary, never infer that an arbitrary internal failure wrote nothing.
      if (json.code === undefined && typeof json.error === "string" &&
          (/^Entry(?: (?:with id )?\d+)? not found$/.test(message) ||
           /^"(?:date|tag|direction|amount|id|entries|mutationId)" (?:must be|is required)/.test(message) ||
           /^Tag ".*" is not a (?:Category|Subcategory or Category)\. (?:Incoming|Outgoing) entries require /.test(message))) throw new Error(message);
      throw new ConnectionError(message);
    }
    if (res.ok === false) throw new ConnectionError(`HTTP ${res.status}; confirmation is unavailable.`);
    // Legacy reads/adds omitted `ok`; their action data still supplies evidence.
    // Void actions have no such evidence and require the explicit success flag.
    if (opts.acknowledgment && !opts.accepts && json.ok !== true && !legacyValidate) {
      throw new ConnectionError("Missing success acknowledgment.");
    }
    if (opts.accepts && !opts.accepts(json)) throw new ConnectionError("Response is missing valid action data.");
    return json as T;
  }

  private gasRequest<T>(init: RequestInit & { url: string }, opts: ResponseOptions = {}): Promise<T> {
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new ConnectionError('Request timed out.'));
        controller.abort();
      }, REQUEST_TIMEOUT_MS);
    });
    return Promise.race([this.parseRequest<T>({ ...init, signal: controller.signal }, opts), timeout])
      .then(value => {
        if (Date.now() - started >= REQUEST_TIMEOUT_MS) throw new ConnectionError('Request timed out.');
        return value;
      }).finally(() => clearTimeout(timer));
  }

  private async gasGet<T>(action: string, accepts: NonNullable<ResponseOptions['accepts']>): Promise<T> {
    const conn = this.getConnection();
    if (!conn) throw new ConnectionMissingError("No Connection configured.");
    return this.gasRequest<T>({
      url: `${conn.gasUrl}?action=${action}&t=${Date.now()}`,
      mode: "cors",
      redirect: "follow",
      cache: "no-store",
    }, { accepts });
  }

  private async gasPost<T>(body: Record<string, unknown>, accepts?: ResponseOptions["accepts"]): Promise<T> {
    const conn = this.getConnection();
    if (!conn) throw new ConnectionMissingError("No Connection configured.");
    return this.gasRequest<T>({
      url: conn.gasUrl,
      method: "POST",
      mode: "cors",
      redirect: "follow",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ ...body, secret: conn.apiSecret }),
    }, { acknowledgment: true, accepts });
  }

  async validateConnection(gasUrl: string, apiSecret: string): Promise<void> {
    await this.gasRequest({
      url: gasUrl,
      method: "POST",
      mode: "cors",
      redirect: "follow",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ action: "validate", secret: apiSecret }),
    }, { tolerateUnknownAction: true, acknowledgment: true });
  }

  async getEntries(): Promise<Entry[]> {
    const data = await this.gasGet<{ entries: Entry[] }>("getEntries",
      data => Array.isArray(data.entries) && data.entries.every(isEntry));
    return dedupeEntries(data.entries.map((e) => ({ ...e, date: normalizeDate(e.date) })));
  }

  async getMaster(): Promise<MasterRow> {
    const data = await this.gasGet<{ master: MasterRow }>("getMaster",
      data => isRecord(data.master) && finiteNumber(data.master.onHand) && recordOf(data.master.budgets, finiteNumber));
    return data.master;
  }

  async getCategories(): Promise<CategoryMap> {
    const data = await this.gasGet<{ categories: CategoryMap }>("getCategories",
      data => recordOf(data.categories, tags => Array.isArray(tags) && tags.every(tag => typeof tag === 'string')));
    return data.categories;
  }

  async getConfig(): Promise<Config> {
    const data = await this.gasGet<{ config: Record<string, string> }>("getConfig",
      data => recordOf(data.config, value => typeof value === 'string'));
    return { ...DEFAULT_CONFIG, ...data.config };
  }

  async getStats(): Promise<StatsData> {
    const data = await this.gasGet<{ stats: StatsData }>("getStats", data => isStats(data.stats));
    return data.stats;
  }

  async addEntry(payload: AddEntryPayload, mutationId = createMutationId()): Promise<Entry> {
    const data = await this.gasPost<{ ok: boolean; entry: Entry }>({
      action: "addEntry",
      ...payload,
      mutationId,
    }, data => isEntry(data.entry) && matchesPayload(data.entry, payload));
    return data.entry;
  }

  async addEntries(payloads: AddEntryPayload[], mutationId = createMutationId()): Promise<Entry[]> {
    const data = await this.gasPost<{ ok: boolean; entries: Entry[] }>({
      action: "addEntries",
      entries: payloads,
      mutationId,
    }, data => Array.isArray(data.entries) && data.entries.length === payloads.length &&
      data.entries.length > 0 && data.entries.every((entry, i, entries) =>
        isEntry(entry) && matchesPayload(entry, payloads[i]) &&
        (i === 0 || entry.id === entries[i - 1].id + 1)));
    return data.entries;
  }

  async updateEntry(id: number, patch: UpdateEntryPatch): Promise<void> {
    await this.gasPost({ action: "updateEntry", id, ...patch });
  }

  async deleteEntry(id: number): Promise<void> {
    await this.gasPost({ action: "deleteEntry", id });
  }
}
