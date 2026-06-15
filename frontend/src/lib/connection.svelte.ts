import type { Connection } from "./types";

const LS_KEY = "ms_connection";
const LS_MOCK_DISMISSED = "ms_mock_dismissed";

function readFromStorage(): Connection | null {
  if (import.meta.env.VITE_MOCK === "true") return { gasUrl: "mock://noop", apiSecret: "mock" };
  if (import.meta.env.DEV && !import.meta.env.VITEST && import.meta.env.VITE_GAS_URL && import.meta.env.VITE_API_SECRET) {
    return { gasUrl: import.meta.env.VITE_GAS_URL, apiSecret: import.meta.env.VITE_API_SECRET };
  }
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Connection;
  } catch {
    return null;
  }
}

const _initial = readFromStorage();
let current = $state<Connection | null>(_initial);

// Migration: existing users who have a Connection but no dismissal flag get the
// flag written silently so they never see Mock Mode after this feature ships.
if (_initial != null && !localStorage.getItem(LS_MOCK_DISMISSED)) {
  localStorage.setItem(LS_MOCK_DISMISSED, "1");
}

let mockActive = $state(!localStorage.getItem(LS_MOCK_DISMISSED) && _initial == null);

export const connection = {
  get current() { return current; },
};

export const mockMode = {
  get current() { return mockActive; },
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

export function exitMockMode(): void {
  localStorage.setItem(LS_MOCK_DISMISSED, "1");
  localStorage.removeItem("ms_cache");
  window.location.reload();
}

export function generateSetupUrl(): string {
  const conn = current;
  if (!conn) return '';
  const params = new URLSearchParams({ gasUrl: conn.gasUrl, apiSecret: conn.apiSecret });
  return `${window.location.origin}${window.location.pathname}?${params}`;
}
