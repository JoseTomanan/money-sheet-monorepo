import type { GatewayAdapter } from "./types";
import { connection, mockMode } from "./connection.svelte";
import { RealAdapter } from "./adapter-real";
import { MockAdapter } from "./adapter-mock";

export { ConnectionError, ConnectionMissingError, UnauthorizedError, isQueueable, isAuthError, userMessage } from "./adapter-real";
export type { GatewayAdapter } from "./types";

const mockAdapter = new MockAdapter();
const realAdapter = new RealAdapter(() => connection.current);
let _override: GatewayAdapter | null = null;

// Selected per call, not captured at import time — mockMode.current is a live
// predicate, so a Connection saved (or Mock Dismissal set) at runtime takes
// effect on the very next call without a page reload.
export function gateway(): GatewayAdapter {
  return _override ?? (mockMode.current ? mockAdapter : realAdapter);
}

export function setAdapter(a: GatewayAdapter): void {
  _override = a;
}
