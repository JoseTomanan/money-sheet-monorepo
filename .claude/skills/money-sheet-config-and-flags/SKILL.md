---
name: money-sheet-config-and-flags
description: Catalog of every configuration axis in money-sheet-monorepo — Config sheet keys (currency, nickname, dead week_start), Vite env vars (VITE_MOCK, VITE_GAS_URL, VITE_API_SECRET), localStorage keys (ms_connection, ms_mock_dismissed, ms_queue, ms_cache, theme-preference), GAS Script Properties (API_SECRET), and deployment config (.clasp.json, appsscript.json, deploymentId, vite base path, vercel.json, tests/.env). Use when asking "where is X configured", "what does VITE_MOCK do", "why is the app in Mock Mode", "why does dev auto-connect", "where does the currency symbol come from", "how do I add a Config sheet key", "what localStorage keys does the app write", "where is the API secret stored", "why is week_start ignored", or when editing .env/.env.local/.env.example, connection.svelte.ts, config.ts, 8_config.ts, or gas-deploy.yml.
---

# Config and flags catalog

Every knob in this repo, its default, its owner, and how to change it safely. Volatile facts date-stamped (as of 2026-07-10). Line numbers drift — re-verify with the Provenance commands.

## Axis 1 — Config sheet keys (spreadsheet-scoped settings)

The **Config sheet** is a 2-column key→value sheet in the spreadsheet (col A key, col B value), served by the `getConfig` GET action as `ConfigMap = Record<string, string>` and merged over frontend defaults.

| Key | Default | Status | Owner code |
|---|---|---|---|
| `currency` | `₱` | production | seeded in `DEFAULT_CONFIG_ROWS` (`clasp/src/lib/config.ts:2`); fallback `DEFAULT_CONFIG` (`frontend/src/lib/adapter-real.ts:47`); consumed via `store.config.currency` |
| `nickname` | `""` | production | same seed; consumed in `frontend/src/routes/HomeScreen.svelte` greeting |
| `week_start` | — | **candidate / DEAD CODE (as of 2026-07-10)** | Documented in `CONTEXT.md:79` but NOT in `DEFAULT_CONFIG_ROWS` and read nowhere (`grep -rn week_start clasp/src frontend/src` → 0 hits). Reserved for open issue #87; implementer notes live at the bottom of CONTEXT.md's week section (line 105): update `weekStartOf` (frontend) and `weekStartOfStr` (clasp) in tandem. |

Guards: GAS `getConfig()` (`clasp/src/8_config.ts`) returns `{}` when the sheet is missing (legacy spreadsheets) — the frontend fallback masks provisioning gaps. `parseConfigRows` skips rows with empty keys. `ensureConfigSheet` (called by `setup()` in `clasp/src/7_setup.ts`) is a no-op when the sheet exists — it never re-seeds new defaults into old spreadsheets.

## Axis 2 — Vite env vars (frontend build/dev-time)

Read from `frontend/.env` and `frontend/.env.local` (Vite standard precedence: `.env.local` overrides `.env`; both gitignored per `frontend/.gitignore`). Committed template: `frontend/.env.example`. **Never commit real values** — the real GAS URL and API secret live only in gitignored local files.

| Var | Effect | Owner code |
|---|---|---|
| `VITE_MOCK` | `"true"` forces **Mock Mode** (in-memory adapter, no GAS calls) regardless of Connection or dismissal. Playwright e2e sets it to `"true"`; shakedown sets `"false"`. | `frontend/src/lib/connection.svelte.ts:5,35` |
| `VITE_GAS_URL` + `VITE_API_SECRET` | **Dev auto-connect**: when BOTH are set and mode is `DEV` and not `VITEST`, they synthesize a Connection, bypassing localStorage and the setup gate. No effect on production builds. | `connection.svelte.ts:8-9` |

Also gates the live `store-sync.test.ts` (skips without `VITE_GAS_URL`, requires `VITE_MOCK !== "true"`), and `frontend/e2e/api.spec.ts` skips without `VITE_GAS_URL`.

## Axis 3 — localStorage keys (device-scoped state)

| Key | Shape | Owner module |
|---|---|---|
| `ms_connection` | JSON `Connection` = `{ gasUrl, apiSecret }` | `frontend/src/lib/connection.svelte.ts` (`LS_KEY`) |
| `ms_mock_dismissed` | `"1"` flag — set on exiting Mock Mode (Mock Dismissal); auto-migrated for users who already have a Connection | `connection.svelte.ts` (`LS_MOCK_DISMISSED`) |
| `ms_queue` | JSON `QueueItem[]` — Offline Queue ops `add \| addBatch \| edit \| delete` | `frontend/src/lib/queue.ts` |
| `ms_cache` | JSON `CachePayload` = `{ entries, master, categories, config? }`; removed by `exitMockMode()` | `frontend/src/lib/cache.ts` |
| `theme-preference` | `'system' \| 'light' \| 'dark'` | `frontend/src/lib/darkMode.svelte.ts` |

Mock Mode predicate: `envMock || (connection == null && !ms_mock_dismissed)` — first visit with clean storage is Mock Mode.

## Axis 4 — GAS Script Properties

| Property | Purpose | Set by |
|---|---|---|
| `API_SECRET` | Shared secret checked on all POST (mutation) actions | `setup()` menu action → `runSetup` (`clasp/src/lib/setup.ts`) via `Utilities.getUuid()`, with confirm-overwrite prompt; read in `clasp/src/9_main.ts:8` |

Open issue #95 (as of 2026-07-10) proposes word-based secrets — UUID is current behavior.

## Axis 5 — Deployment config

| File | Keys | Notes |
|---|---|---|
| `clasp/.clasp.json` | `scriptId`, `rootDir: "./dist"` | committed; push targets `dist/` only |
| `clasp/src/appsscript.json` | `timeZone: "Asia/Manila"`, `runtimeVersion: "V8"`, `webapp.executeAs: "USER_DEPLOYING"`, `webapp.access: "ANYONE_ANONYMOUS"`, `oauthScopes: [spreadsheets, script.external_request]` | copied to `dist/` by the build's strip-exports step |
| `.github/workflows/gas-deploy.yml` | **hardcoded** `--deploymentId AKfycbxdLiLC…` in the deploy step; secret `CLASP_CREDENTIALS` → `~/.clasprc.json` | changing the deployment means editing this workflow |
| `frontend/vite.config.ts` | `base: "/money-sheet-monorepo/"` | GitHub Pages project path; Vercel serves the same build at `/` via rewrites-free static hosting |
| `vercel.json` (repo root) | `buildCommand`/`outputDirectory`/`installCommand` all pointed at `frontend/` | alternate host of the same frontend build |
| `tests/.env` | `GAS_URL`, `API_SECRET` (template `tests/.env.example`; gitignored) | consumed by `tests/src/client.ts` `requireEnv`, and by `frontend/shakedown/playwright.config.ts` which loads `../../tests/.env` |

## Checklist — add a Config sheet key end-to-end

Reference implementation notes: CONTEXT.md week section (#87 implementer note). File an issue first (see `money-sheet-change-control`).

1. `clasp/src/lib/config.ts` — add `["your_key", "default"]` to `DEFAULT_CONFIG_ROWS`. Note `ensureConfigSheet` only seeds NEW spreadsheets; existing sheets need the row added manually (or a migration).
2. Wire type: `ConfigMap` in `clasp/src/lib/dispatch.ts:82` is `Record<string, string>` — no change needed for string values; parity guards (`clasp/src/_contract_parity.ts:21`, `tests/src/wire-contract.parity.ts:32`) hold automatically. Never weaken them.
3. `frontend/src/lib/types.ts` — extend `interface Config` if the key needs a required field with a client-side default (like `currency`); Config is intentionally NOT equality-checked against ConfigMap, only asserted assignable to `Record<string, string>` (`frontend/src/lib/wire-contract.parity.ts:41-45`).
4. `frontend/src/lib/adapter-real.ts` — add the default to `DEFAULT_CONFIG` (merged over on fetch AND used as catch-all fallback); mirror in `mockGetConfig` (`frontend/src/lib/mock.ts`) and the store's initial `$state` (`frontend/src/lib/store.svelte.ts:20`).
5. Surface in Settings UI (`frontend/src/components/settings/Settings.svelte`) or the consuming view. Constrained-choice keys get Google Sheets dropdown chip validation on the value cell (CONTEXT.md:79).
6. Document the key in CONTEXT.md's Config sheet paragraph. Validate: `cd clasp && npx tsc --noEmit && npm run test:run`; `cd frontend && npm run check && npm run test:run`.

## When NOT to use this skill

- Recreating the dev environment, install traps, port 1111, strip-exports build → `money-sheet-build-and-env`.
- Actually deploying (CI runs, manual clasp push/deploy, `setup()` operation, triggers) → `money-sheet-run-and-operate`.
- GAS platform theory (Script Properties semantics, locks, quotas, CORS text/plain trick) → `sheets-gas-reference`.
- Debugging a symptom whose cause happens to be config → start at `money-sheet-debugging-playbook`.
- Process for landing a config change (issue-first, parity-checks-are-sacred) → `money-sheet-change-control`.

Details, shapes, and behavior notes per axis: see [REFERENCE.md](REFERENCE.md).

## Provenance and maintenance

Verified against the repo 2026-07-10. Re-verify each axis:

```bash
grep -n "DEFAULT_CONFIG_ROWS" clasp/src/lib/config.ts                      # Axis 1 seeds
grep -rn "week_start" clasp/src frontend/src                               # Axis 1 dead-code check (expect 0 hits)
gh issue view 87 --json state,labels                                       # Axis 1 candidate status
grep -rn "import.meta.env.VITE_" frontend/src frontend/playwright.config.ts # Axis 2
grep -rn "localStorage.setItem\|const KEY\|LS_KEY\|STORAGE_KEY" frontend/src/lib/{connection.svelte,queue,cache,darkMode.svelte}.ts  # Axis 3
grep -rn "API_SECRET" clasp/src --include="*.ts" | grep -v test            # Axis 4
grep -n "deploymentId" .github/workflows/gas-deploy.yml                    # Axis 5 deployment id
grep -n "base:" frontend/vite.config.ts && cat clasp/.clasp.json vercel.json tests/.env.example  # Axis 5 rest
grep -n "ConfigMap\|Config" clasp/src/_contract_parity.ts frontend/src/lib/wire-contract.parity.ts  # checklist parity claims
```
