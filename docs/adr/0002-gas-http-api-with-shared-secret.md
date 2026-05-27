# ADR-0002: GAS Web App as HTTP API with Shared-Secret Write Auth

**Status:** Accepted

## Context

The frontend (Svelte 5) is a separate static site that needs to read and write financial data stored in Google Sheets. GAS can expose a web app via `doGet`/`doPost`. The question is how to gate write operations without full OAuth.

## Decision

Expose GAS as a web app (`doGet` for reads, `doPost` for all mutations). Write operations require a shared secret passed in the POST body, stored in GAS Script Properties as `API_SECRET`. Read operations are unauthenticated.

## Consequences

- No OAuth flow needed; the frontend stores the secret in localStorage, entered at runtime via the Settings screen — no build-time env vars required.
- Supports multiple independent users sharing one deployed URL; each device configures its own Connection pointing at its own spreadsheet.
- Changing the secret requires updating Script Properties in GAS and re-entering the secret in the Settings screen.
- Full OAuth / Google Sign-In is explicitly deferred; this decision should be revisited if stronger authentication is needed.
