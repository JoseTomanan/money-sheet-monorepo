# Config and flags — deep reference

Companion to [SKILL.md](SKILL.md). All facts verified against the repo as of 2026-07-10.

## Axis 1 — Config sheet: full read path

```
Config sheet (col A key, col B value)
  → getConfigSheetOrNull()            clasp/src/1_sheets.ts:28
  → getConfig(): ConfigMap            clasp/src/8_config.ts   ({} if sheet missing or empty)
  → parseConfigRows(rows)             clasp/src/lib/config.ts (trims, skips empty keys)
  → dispatch action "getConfig"       clasp/src/lib/dispatch.ts (in READ_ACTIONS — no secret)
  → wire: { ok: true, config: ConfigMap }
  → RealAdapter.getConfig()           frontend/src/lib/adapter-real.ts
      { ...DEFAULT_CONFIG, ...data.config }   — defaults merged UNDER server values
      catch → DEFAULT_CONFIG                  — errors swallowed (never blocks the app)
  → store.config                      frontend/src/lib/store.svelte.ts:20 (initial {currency:"₱"})
      refreshAll: Promise.allSettled — failed getConfig keeps previous store value
      init(): cache-first — ms_cache.config (optional field) restored before network
```

Behavior notes:

- **Seeding**: `ensureConfigSheet(ss, defaults = DEFAULT_CONFIG_ROWS)` (`clasp/src/lib/config.ts:25-34`) inserts the sheet and appends default rows ONLY when the sheet is absent. Adding a key to `DEFAULT_CONFIG_ROWS` later does nothing for spreadsheets that already have a Config sheet — add the row by hand or ship a migration.
- **`getConfig` returns `{}` for a missing sheet** — deliberate tolerance for legacy spreadsheets, and a known weak point: a mis-provisioned spreadsheet is indistinguishable from a legacy one; the frontend silently shows defaults.
- **`week_start` dead-code proof** (as of 2026-07-10): `grep -rn "week_start" clasp/src frontend/src tests/src` → zero hits. Only mention is prose in `CONTEXT.md:79` (`"Sunday"` or `"Monday"`, default `"Sunday"`) plus the #87 implementer note at `CONTEXT.md:105`: change `weekStartOf` (`frontend/src/lib/groupEntries.ts`) and `weekStartOfStr` (`clasp/src/lib/weeks.ts`) in tandem — they are runtime-parity-tested against each other in `frontend/src/lib/parity.test.ts`. Issue #87 is OPEN, labeled `enhancement, ready-for-agent`.
- Consumers of `store.config.currency`: `components/ui/Money.svelte`, `routes/HomeScreen.svelte`, `routes/SummaryView.svelte`, `components/category/RedistributeSheet.svelte`, `components/entry/SplitLegCarousel.svelte`. Consumer of `nickname`: `routes/HomeScreen.svelte` greeting.

## Axis 2 — Vite env: file precedence and every read site

Precedence (standard Vite, dev and build): `.env.local` overrides `.env`; `.env.example` is never loaded — it is the committed template. `frontend/.gitignore` ignores `.env`, `.env.local`, `.env.*.local`. Real credentials exist only in gitignored local files — never quote or commit them.

`frontend/.env.example` (committed, all-empty):

```
# Set to "true" to use in-memory mock data instead of calling the GAS API
VITE_MOCK=
# GAS web app URL and API secret — skips the setup gate in dev mode when set
VITE_GAS_URL=
VITE_API_SECRET=
```

Read sites:

| Site | Reads | Behavior |
|---|---|---|
| `frontend/src/lib/connection.svelte.ts:5` | `VITE_MOCK === "true"` | `envMock` — short-circuits the Mock Mode predicate to true |
| `connection.svelte.ts:8-9` | `DEV && !VITEST && VITE_GAS_URL && VITE_API_SECRET` | dev auto-connect: `readFromStorage()` returns the env Connection, never touching `ms_connection`. Only in `npm run dev`; `VITEST` guard keeps unit tests deterministic; production builds are not DEV so are unaffected |
| `frontend/playwright.config.ts` | `loadEnv()` (dotenv) then sets `VITE_MOCK: "true"` on the dev server it auto-starts (port 1111) | e2e always runs the mock adapter |
| `frontend/shakedown/playwright.config.ts` | `loadEnv({ path: ../../tests/.env })`, sets `VITE_MOCK: "false"` | live-GAS shakedown pulls credentials from the tests package, not `frontend/.env` |
| `frontend/src/lib/store-sync.test.ts:25-26,59-60` | `VITE_GAS_URL`, `VITE_API_SECRET`, `VITE_MOCK !== "true"` | live guard: whole file skips without a URL (the "1 skipped file / 4 skipped tests" in `npm run test:run`) |
| `frontend/e2e/api.spec.ts:3,7` | `VITE_GAS_URL` (via process.env after loadEnv) | skips with message "VITE_GAS_URL not set — add it to frontend/.env to run this test" |

## Axis 3 — localStorage: shapes and lifecycles

| Key | Written when | Cleared when |
|---|---|---|
| `ms_connection` | `setConnection()` (Settings save, `importFromUrl()` query-param import) | never automatically (no disconnect flow removes it as of 2026-07-10) |
| `ms_mock_dismissed` | `exitMockMode()`; silent migration for users who already had a Connection (`connection.svelte.ts:25-27`) | never |
| `ms_queue` | `writeQueue`/`enqueue` on failed/offline mutations; coalescing rules in `queue.ts` (ADR-0004) | items removed as drain confirms them; FIFO, stops on first error |
| `ms_cache` | `saveSnapshot` after successful `refreshAll` (`store.svelte.ts:70`) | `exitMockMode()` removes it (`connection.svelte.ts:56`) so mock data never leaks into real mode |
| `theme-preference` | `darkMode.setPreference()` | never; absent ⇒ `'system'` |

`QueueItem` union (`frontend/src/lib/queue.ts:5-13`):

```ts
| { op: "add";      tempId: number;   payload: AddEntryPayload }
| { op: "addBatch"; tempIds: number[]; payloads: AddEntryPayload[] }  // frozen until synced
| { op: "edit";     id: number;       patch: UpdateEntryPatch }
| { op: "delete";   id: number }
```

`CachePayload` (`frontend/src/lib/cache.ts`): `{ entries: Entry[]; master: MasterRow; categories: CategoryMap; config?: Config }` — `config` optional (older caches lack it; `store.init()` only overwrites when present).

`?gasUrl=…&apiSecret=…` query params (from `generateSetupUrl()` on another device) are consumed by `importFromUrl()` and immediately stripped from the URL via `history.replaceState`.

## Axis 4 — Script Properties detail

`runSetup(props, ui, generateSecret)` (`clasp/src/lib/setup.ts`) is pure/injected for testability; `setup()` in `clasp/src/7_setup.ts` binds `generateSecret = () => Utilities.getUuid()` and also calls `ensureConfigSheet(ss)`. If `API_SECRET` already exists, a YES/NO alert gates regeneration; the new secret is shown once in a `ui.alert`. `doPost` reads it at `clasp/src/9_main.ts:8` with `?? ""` fallback (unset property ⇒ every authed request fails `auth`). Rotating the secret requires updating: frontend Connection(s) on every device, `frontend/.env(.local)` dev auto-connect values, and `tests/.env`.

## Axis 5 — Deployment config detail

- `clasp/.clasp.json`: committed; `rootDir: "./dist"` means `clasp push` only ships built output — hand-edits to `src/` do nothing until `npm run build` (see `money-sheet-build-and-env`).
- `clasp/src/appsscript.json`: `strip-exports.js` copies it into `dist/` at build. `executeAs: USER_DEPLOYING` + `access: ANYONE_ANONYMOUS` is what makes unauthenticated GETs possible (auth is app-level via `API_SECRET`, per ADR-0002). `timeZone: Asia/Manila` drives `weekStartSunday` autohide math — one of multiple hardcoded "Asia/Manila" copies (known weak point).
- `gas-deploy.yml`: triggers on push to `main` filtered to `clasp/**` (root CLAUDE.md says `master` — stale). The deploy step pins `--deploymentId AKfycbxdLiLCsSghYoyKEF5qk0yV8eBUCIDpFEZrWwlmjC-qS1FdZEIdGocV3BQ9TYjK74Xonw --description "Frontend API"` so the web app URL is stable across deploys. `CLASP_CREDENTIALS` repo secret is written to `~/.clasprc.json`.
- `frontend/vite.config.ts` `base: "/money-sheet-monorepo/"`: required for GitHub Pages project hosting; asset URLs break if renamed repo or moved to a user page.
- `vercel.json`: root-level; builds and serves the identical `frontend/dist` — no env/config beyond the three command fields.
- `tests/.env` (gitignored; template `tests/.env.example`): `GAS_URL`, `API_SECRET` consumed by `requireEnv` in `tests/src/client.ts:35` and by the shakedown Playwright config. CI runs `tests/` typecheck only — integration needs these live creds, deliberately absent from CI.

## Provenance and maintenance

```bash
sed -n '1,10p' clasp/src/8_config.ts                                        # tolerant getConfig
grep -n "DEFAULT_CONFIG" frontend/src/lib/adapter-real.ts                   # frontend default + merge
grep -rn "week_start" clasp/src frontend/src tests/src; gh issue view 87    # dead key + issue status
grep -n "VITE_MOCK\|loadEnv" frontend/playwright.config.ts frontend/shakedown/playwright.config.ts
grep -n "removeItem\|setItem" frontend/src/lib/connection.svelte.ts         # ms_cache purge on exitMockMode
grep -n "getUuid\|ensureConfigSheet" clasp/src/7_setup.ts                   # secret generation binding
grep -n "on:\|branches\|paths\|deploymentId" .github/workflows/gas-deploy.yml
```
