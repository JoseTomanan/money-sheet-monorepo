import type { Connection } from "./types";

const LS_KEY = "ms_connection";

function readFromStorage(): Connection | null {
  if (import.meta.env.VITE_MOCK === "true") return { gasUrl: "mock://noop", apiSecret: "mock" };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Connection;
  } catch {
    return null;
  }
}

let current = $state<Connection | null>(readFromStorage());

export const connection = {
  get current() { return current; },
};

export function setConnection(c: Connection): void {
  localStorage.setItem(LS_KEY, JSON.stringify(c));
  current = c;
}

export function importFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  const gasUrl = params.get('gasUrl');
  const apiSecret = params.get('apiSecret');
  if (gasUrl && apiSecret) {
    setConnection({ gasUrl, apiSecret });
    history.replaceState(null, '', window.location.pathname + window.location.hash);
  }
}

export function generateSetupUrl(): string {
  const conn = current;
  if (!conn) return '';
  const params = new URLSearchParams({ gasUrl: conn.gasUrl, apiSecret: conn.apiSecret });
  return `${window.location.origin}${window.location.pathname}?${params}`;
}
