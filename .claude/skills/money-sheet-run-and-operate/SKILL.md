---
name: money-sheet-run-and-operate
description: Runbook for running, building, deploying, and operating money-sheet-monorepo. Use when starting the dev server (npm run dev, port 1111, "Port 1111 is already in use", strictPort), toggling Mock Mode vs a real Connection (VITE_MOCK, MockBanner, SettingsGate, dev auto-connect), building (frontend dist/, clasp dist/ is GENERATED — never hand-edit), deploying ("my doGet/doPost change isn't live", pinned deploymentId, clasp push vs clasp deploy, gas-deploy.yml, pages-deploy.yml, GitHub Pages, vercel.json, workflow_dispatch), running manual clasp push (cd clasp && npm run push, clasp login), spreadsheet operations (Autohide menu, Run setup, setup(), installWeeklyVisibilityTrigger, separator rows with blank col H, Categories menu category-sync trigger), or smoke-testing the live API (curl getEntries/getMaster/getCategories/getConfig, validate POST, error envelope, "unauthorized", GAS cold start, gh run list). Also answers "what output lands where" (dist dirs, Pages URL, coverage/, test-results/).
---

# Run and operate money-sheet-monorepo

Two independent packages: `clasp/` (Google Apps Script backend, TypeScript, pushed with the `clasp` CLI) and `frontend/` (Svelte 5 + Vite SPA). No root workspace — always `cd` into the package first. All facts below verified 2026-07-10.

## Dev server

```bash
cd frontend && npm run dev -- --port 1111
```

- Port 1111 is baked into `frontend/vite.config.ts` (`port: 1111, strictPort: true`), so plain `npm run dev` also uses it. **If port 1111 is already listening, it is this project's server — reuse it, never start another or pick a different port** (house rule, root CLAUDE.md).
- URL: `http://localhost:1111/money-sheet-monorepo/` — the Vite `base` is `/money-sheet-monorepo/` even in dev.

**Mock vs real mode** (predicate in `frontend/src/lib/connection.svelte.ts`):

| Condition | Result |
|---|---|
| `VITE_MOCK=true` in env | Mock Mode forced (in-memory data, no network). e2e uses this. |
| DEV (non-Vitest) + `VITE_GAS_URL` + `VITE_API_SECRET` set in `frontend/.env` | Auto-connect: a real Connection is synthesized from env; app talks to live GAS |
| No Connection stored and `ms_mock_dismissed` absent from localStorage | Mock Mode with `MockBanner` across the top (first-run default) |
| Exited Mock Mode (`ms_mock_dismissed` set) but no Connection | `SettingsGate` full-screen setup form |

Real credentials live only in gitignored local files (`frontend/.env`); `frontend/.env.example` shows the three vars. Deeper config semantics: see `money-sheet-config-and-flags`.

## Builds

| Package | Command (from package dir) | Output | Notes |
|---|---|---|---|
| frontend | `npm run build` | `frontend/dist/` | Vite, `base: "/money-sheet-monorepo/"` — assets 404 if served from a different path |
| clasp | `npm run build` | `clasp/dist/` | `tsc` then `scripts/strip-exports.js` (strips `export` keywords so files work as GAS globals). **`clasp/dist/` is generated and gitignored — NEVER hand-edit it or push without building**; see `money-sheet-change-control` |

## Deploys

**Automatic (normal path)** — GitHub Actions on push to `main`, path-filtered (root CLAUDE.md says `master` — stale; all workflows trigger on `main`):

| Workflow | Trigger paths | What it does |
|---|---|---|
| `.github/workflows/gas-deploy.yml` ("Deploy GAS") | `clasp/**` | `npm run build` → `npx @google/clasp push -f` → `npx @google/clasp deploy --deploymentId <pinned id hardcoded in the workflow>` |
| `.github/workflows/pages-deploy.yml` ("Deploy Frontend") | `frontend/**` | Build → GitHub Pages (`actions/deploy-pages`) |
| `vercel.json` (repo root) | Vercel's own git integration | Alternate host of the same `frontend/dist` build |

Both workflows also support manual `workflow_dispatch` (`gh workflow run gas-deploy.yml`).

**CRITICAL — versioned deployment model.** `clasp push` only updates the script project's *source* (what the editor shows / HEAD deployment). The public `/exec` web-app URL is bound to a **pinned deployment** and serves a frozen *version* until that deployment is redeployed. So after any `doGet`/`doPost` change: pushing is NOT enough — `clasp deploy --deploymentId <pinned>` must run to cut a new version onto the same URL. CI does this; a manual `npm run push` does NOT. Full model: `sheets-gas-reference`.

**Manual local push** (updates source only, see above):

```bash
cd clasp && npm run push        # = npm run build && npx @google/clasp push -f
# requires prior: npx @google/clasp login
```

The target script id lives in `clasp/.clasp.json` (`rootDir: ./dist`). CI auth uses the `CLASP_CREDENTIALS` repo secret written to `~/.clasprc.json`.

## Spreadsheet operations (in the Google Sheet UI)

Custom menus built by `clasp/src/lib/menu.ts` on open:

| Menu item | Function | Effect |
|---|---|---|
| Autohide → Run autohide now | `applyRowVisibilityForActiveSheet` | Inserts missing separator rows (blank col H = separator marker) for completed weeks, then hides/shows rows by tier: current week shown, recent weeks separators-only, old weeks hidden. Runs under the document lock (ADR-0009) |
| Autohide → Install weekly trigger | `installWeeklyVisibilityTrigger` | Deletes any existing trigger for that handler, installs a time-based trigger: Sunday 01:00, Asia/Manila |
| Autohide → Run setup | `setup` | Generates an API secret (UUID) into Script Properties `API_SECRET` (confirm-overwrite alert if one exists, then displays it once) and seeds the Config sheet. **Does NOT create INCOMING/OUTGOING, MASTER, or Categories sheets** — those come from the spreadsheet template |
| Categories → Install category-sync trigger / Retry last category sync | `installCategorySyncTrigger` / `retryLastCategorySync` | Subcategory rename/delete sync (issue #126, `6_category_sync.ts`) — as of 2026-07-10 |

## Ops checks

Smoke-test the live API (placeholders — never commit real values; `GAS_URL` is the `/exec` web-app URL):

```bash
curl -sL "$GAS_URL?action=getEntries"      # -L required: GAS 302-redirects /exec
curl -sL -H "Content-Type: text/plain" -d '{"action":"validate","secret":"'$API_SECRET'"}' "$GAS_URL"
# expect {"ok":true}; wrong secret → {"ok":false,"error":"unauthorized","code":"auth",...}
```

All four GET actions (`getEntries`, `getMaster`, `getCategories`, `getConfig`) are unauthenticated; every mutation POSTs `Content-Type: text/plain`. Error envelope: `{ok:false, error, code, message}`, `code ∈ auth|validation|not_found|internal`. Full curl anatomy per action, envelope semantics, and cold-start expectations: [REFERENCE.md](REFERENCE.md).

Check deploy status: `gh run list --limit 5` (workflow names: "Deploy GAS", "Deploy Frontend", "CI").

## Artifact map

| Path | What | Committed? |
|---|---|---|
| `frontend/dist/` | Pages/Vercel payload | no (gitignored) |
| `clasp/dist/` | GAS push payload (generated) | no |
| `frontend/coverage/` | vitest coverage HTML — **stale** (last generated 2026-06-15 as of 2026-07-10) | no |
| `frontend/test-results/`, `frontend/playwright-report/` | Playwright artifacts | no |
| GitHub Pages URL | `https://<owner>.github.io/money-sheet-monorepo/` (repo: JoseTomanan/money-sheet-monorepo) | — |

## When NOT to use this skill

- Env-from-scratch setup, tool versions, strip-exports internals → `money-sheet-build-and-env`
- What VITE_MOCK / localStorage keys / Config sheet keys mean → `money-sheet-config-and-flags`
- Something is broken and you're triaging a symptom → `money-sheet-debugging-playbook`
- GAS runtime theory (deployments vs versions in depth, locks, quotas, CORS trick) → `sheets-gas-reference`
- Whether/how a change may be made or merged, CI gates → `money-sheet-change-control`
- Latency/cold-start measurement rather than expectation → `money-sheet-diagnostics-and-tooling`

## Provenance and maintenance

See the end of [REFERENCE.md](REFERENCE.md) for one-line re-verification commands for every volatile fact above.
