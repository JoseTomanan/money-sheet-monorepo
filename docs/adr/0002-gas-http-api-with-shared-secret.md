# ADR-0002: GAS Web App as HTTP API with Shared-Secret Write Auth

**Status:** Accepted

## Context

The frontend (Svelte 5) is a separate static site that needs to read and write financial data stored in Google Sheets. GAS can expose a web app via `doGet`/`doPost`. The question is how to gate write operations without full OAuth.

## Decision

Expose GAS as a web app (`doGet` for reads, `doPost` for all mutations). Write operations require a shared secret passed in the POST body, stored in GAS Script Properties as `API_SECRET`. Read operations are unauthenticated.

The bound script provisions this credential during `onOpen()`, using only services available to the simple trigger. Script Properties also store `API_SECRET_SPREADSHEET_ID`, binding the secret to the active spreadsheet identity. The same spreadsheet reuses its existing secret; a copied spreadsheet whose inherited binding names the source spreadsheet generates and stores a new secret. A legacy spreadsheet with `API_SECRET` but no identity property adopts that secret so existing frontend Connections continue to work.

The credential is visible only through the editor-invoked **Connection → Show connection details** spreadsheet dialog. It is never returned by `doGet`, `getConfig`, or another unauthenticated endpoint. Rotation is an explicit **Connection → Rotate API secret** recovery action and is not required during onboarding.

## Consequences

- No OAuth flow needed; the frontend stores the secret in localStorage, entered at runtime via the Settings screen — no build-time env vars required.
- Supports multiple independent users sharing one deployed URL; each device configures its own Connection pointing at its own spreadsheet.
- Changing the secret requires updating Script Properties in GAS and re-entering the secret in the Settings screen.
- Copying the template cannot intentionally share the source spreadsheet's effective credential; identity mismatch causes per-copy reprovisioning.
- Reopening a spreadsheet is idempotent and does not invalidate saved Connections.
- The maintained template, rather than first-run GAS, owns the Config/STATS sheet structure and Mutation ID column.
- Full OAuth / Google Sign-In is explicitly deferred; this decision should be revisited if stronger authentication is needed.

## Action table

| Action | Method | Auth |
|---|---|---|
| `getEntries` | GET | none |
| `getMaster` | GET | none |
| `getCategories` | GET | none |
| `getConfig` | GET | none |
| `addEntry` | POST | secret |
| `addEntries` | POST | secret |
| `updateEntry` | POST | secret |
| `deleteEntry` | POST | secret |

`addEntries` (added in issue #111) is the same shared-secret write auth as every other mutation — it accepts an ordered array of entry payloads and inserts them atomically under one document lock. See the dedicated batch-add ADR for its semantics.
