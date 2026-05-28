import type { Connection } from "./types";

const LS_KEY = "ms_connection";

function readFromStorage(): Connection | null {
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
