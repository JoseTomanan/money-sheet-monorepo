/** Opaque idempotency key for one user-initiated add operation. */
export function createMutationId(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (typeof randomUuid === "function") return randomUuid.call(globalThis.crypto);

  // `randomUUID` is supported by modern browsers. Keep a UUID-like fallback
  // for older webviews without ever deriving identity from an Entry ID or row.
  const random = Math.random().toString(16).slice(2);
  return `mutation-${Date.now().toString(36)}-${random}`;
}
