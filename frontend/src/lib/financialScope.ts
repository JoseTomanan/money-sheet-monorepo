import type { Connection } from './types';

export function readSavedConnection(): Connection | null {
  if (import.meta.env.DEV && !import.meta.env.VITEST && import.meta.env.VITE_GAS_URL && import.meta.env.VITE_API_SECRET) {
    return { gasUrl: import.meta.env.VITE_GAS_URL, apiSecret: import.meta.env.VITE_API_SECRET };
  }
  let raw: string | null;
  try { raw = localStorage.getItem('ms_connection'); }
  catch (cause) { throw new Error("Couldn't read pending saves on this device. Restore browser storage and try again.", { cause }); }
  try { return raw ? JSON.parse(raw) : null; }
  catch { return null; }
}

export function usesMock(connection: Connection | null): boolean {
  return import.meta.env.VITE_MOCK === 'true' || (connection === null && !localStorage.getItem('ms_mock_dismissed'));
}

// Secrets authenticate requests; only the exact saved URL owns financial data.
// Reading persisted bootstrap here keeps persistence independent of UI runes.
export function financialScope(): string | null {
  const saved = readSavedConnection();
  return usesMock(saved) ? null : saved?.gasUrl ?? null;
}

export function scopedKey(key: 'ms_queue' | 'ms_cache', scope: string | null = financialScope()): string {
  return `${key}:v2:${JSON.stringify(scope)}`;
}
