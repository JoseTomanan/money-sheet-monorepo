import type { Connection } from "./types";
import { readSavedConnection, usesMock } from './financialScope';

const LS_KEY = "ms_connection";
const LS_MOCK_DISMISSED = "ms_mock_dismissed";

function readFromStorage(): Connection | null {
  try {
    return readSavedConnection();
  } catch {
    return null;
  }
}

const _initial = readFromStorage();
let current = $state<Connection | null>(_initial);
const listeners = new Set<() => void>();
export function onConnectionChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Migration: existing users who have a Connection but no dismissal flag get the
// flag written silently so they never see Mock Mode after this feature ships.
if (_initial != null && !localStorage.getItem(LS_MOCK_DISMISSED)) {
  localStorage.setItem(LS_MOCK_DISMISSED, "1");
}

export const connection = {
  get current() { return current; },
};

export const mockMode = {
  get current() {
    return usesMock(current);
  },
};

export function setConnection(c: Connection): void {
  localStorage.setItem(LS_KEY, JSON.stringify(c));
  if (current?.gasUrl === c.gasUrl && current.apiSecret === c.apiSecret) return;
  current = c;
  for (const listener of listeners) listener();
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
