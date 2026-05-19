# ADR-0002: GAS Web App as HTTP API with Shared-Secret Write Auth

**Status:** Accepted

## Context

The frontend (Svelte 5) is a separate static site that needs to read and write financial data stored in Google Sheets. GAS can expose a web app via `doGet`/`doPost`. The question is how to gate write operations without full OAuth.

## Decision

Expose GAS as a web app (`doGet` for reads, `doPost` for all mutations). Write operations require a shared secret passed in the POST body, stored in GAS Script Properties as `API_SECRET`. Read operations are unauthenticated.

## Consequences

- No OAuth flow needed; the frontend stores the secret locally (e.g., env var at build time or localStorage).
- Suitable for personal single-user use — not appropriate if multiple users or untrusted clients are involved.
- Changing the secret requires updating Script Properties in GAS and redeploying the frontend config.
- Full OAuth / Google Sign-In is explicitly deferred; this decision should be revisited if the app is shared with others.
