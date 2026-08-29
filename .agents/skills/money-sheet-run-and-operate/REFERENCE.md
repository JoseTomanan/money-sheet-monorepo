# REFERENCE — ops checks, curl anatomy, deployment model detail

Companion to [SKILL.md](SKILL.md). All facts verified against the repo 2026-07-10.

## curl anatomy

Setup (placeholders — real values live only in gitignored local files like `frontend/.env` and `tests/.env`; never commit or echo them into logs):

```bash
GAS_URL="https://script.google.com/macros/s/<deploymentId>/exec"
API_SECRET="<from Script Properties API_SECRET>"
```

Rules that apply to every call:

- **`-L` is mandatory.** GAS answers `/exec` with a 302 redirect to `script.googleusercontent.com`; without `-L` you get an HTML redirect stub, not JSON. (The frontend equivalently uses `redirect: "follow"` in `adapter-real.ts`.)
- POSTs use `Content-Type: text/plain` — this is what the frontend sends to avoid a CORS preflight; GAS parses the body as JSON regardless (`doPost` in `clasp/src/9_main.ts`).
- `doGet` reads `action` (and optionally other params) from the query string; `doPost` reads everything, including `action` and `secret`, from the JSON body.

### GET actions (unauthenticated — `READ_ACTIONS` in `clasp/src/lib/dispatch.ts:318`)

```bash
curl -sL "$GAS_URL?action=getEntries"     # → {"ok":true,"entries":[{"id":1,"date":"YYYY-MM-DD","tag":...,"mainCategory":...,"description":...,"direction":"I"|"O","amount":...}, ...]}
curl -sL "$GAS_URL?action=getMaster"      # → {"ok":true,"master":{"onHand":...,"budgets":{...}}}
curl -sL "$GAS_URL?action=getCategories"  # → {"ok":true,"categories":{ "<Subcategory>":"<Category>", ... }}
curl -sL "$GAS_URL?action=getConfig"      # → {"ok":true,"config":{"currency":"₱","nickname":""}}
```

### validate POST (secret check with no side effects)

```bash
curl -sL -H "Content-Type: text/plain" \
  -d '{"action":"validate","secret":"'"$API_SECRET"'"}' "$GAS_URL"
# correct secret → {"ok":true}
# wrong/missing  → {"ok":false,"error":"unauthorized","code":"auth","message":"..."}
```

`validate` is one of the `AUTH_ACTIONS` (`dispatch.ts:322`) alongside `addEntry`, `addEntries`, `updateEntry`, `deleteEntry`. Do not smoke-test with the mutating actions against the real sheet — use `validate`.

## Reading the error envelope

Every error is `{ok:false, error, code, message}` (`err()` in `dispatch.ts:123-127`):

| `code` | Meaning | `error` field |
|---|---|---|
| `auth` | missing/wrong secret | the sentinel string `"unauthorized"` (legacy; frontend keys off it) |
| `validation` | payload shape or domain invariant violated (e.g. `"Outgoing entries cannot have a negative amount"`) | mirrors `message` |
| `not_found` | referenced Entry ID does not exist | mirrors `message` |
| `internal` | unexpected runtime error **or unknown action** (unknown action is checked before the auth gate) | mirrors `message` |

`code`/`message` are the structured fields new clients should read; `error` is legacy compatibility. A non-JSON POST body also returns `code:"internal"` (JSON.parse failure in `doPost`).

## GAS cold starts and timeouts

- A GAS web app that has been idle cold-starts on the next request; expect the first call to be noticeably slower than subsequent ones (order of seconds — exact numbers vary; measure with `money-sheet-diagnostics-and-tooling`, don't guess).
- The frontend aborts any request after 15 s (`REQUEST_TIMEOUT_MS = 15_000` in `frontend/src/lib/adapter-real.ts:48`, surfaced as `ConnectionError("Request timed out.")`). A single slow cold start can therefore look like an outage in the UI; retry once before digging.

## Versioned deployment model (why "I pushed but it's not live")

GAS separates three things:

1. **Source** — what `clasp push -f` uploads from `clasp/dist/`. Visible in the script editor immediately. Serves only the HEAD (test) deployment (`/dev` URL, editor-only).
2. **Versions** — immutable snapshots of the source, cut by `clasp deploy`.
3. **Deployments** — a stable `/exec` URL pinned to one version. This project has one production deployment; its id is hardcoded in `.github/workflows/gas-deploy.yml` (`clasp deploy --deploymentId ... --description "Frontend API"`), which re-points the SAME URL at a NEW version.

Consequences:

- `cd clasp && npm run push` alone leaves the public URL serving the old version. CI (`gas-deploy.yml` on push to `main` touching `clasp/**`) does push **and** deploy.
- Never `clasp deploy` without `--deploymentId` — that creates a *new* deployment with a *new* URL that nothing points at.
- Web app config: `executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`, timezone `Asia/Manila` (`clasp/src/appsscript.json`). Deeper theory: `sheets-gas-reference`.

## Checking deploy status

```bash
gh run list --limit 5                                  # recent runs: "CI", "Deploy GAS", "Deploy Frontend"
gh run list --workflow=gas-deploy.yml --limit 3
gh run watch                                           # follow an in-progress run
gh workflow run gas-deploy.yml                         # manual redeploy (workflow_dispatch)
```

## Spreadsheet ops detail

- **Separator rows**: a row whose col H (ENTRY ID) is blank is a separator (`isSeparatorRow`, marker defined in `clasp/src/lib/repository.ts`). Autohide writes the week's Sunday date in col B and an italic week label in col E, leaving H blank. GAS entry reads skip them.
- **Visibility tiers** (`5_visibility.ts`): current week → all rows shown; recent (within 4 weeks, `weekTier` in `lib/weeks.ts`) → only separators shown; older → everything hidden. Rows are hidden, never deleted.
- **Trigger hygiene**: `installWeeklyVisibilityTrigger` first deletes existing triggers for `applyRowVisibilityForActiveSheet`, so re-running the menu item is idempotent.
- **setup() scope**: writes Script Properties `API_SECRET` and seeds the Config sheet (`ensureConfigSheet`; defaults `currency` "₱", `nickname` "" from `lib/config.ts`). It does not create INCOMING/OUTGOING, MASTER, or Categories, and it does not install any trigger.

## Artifact map notes

- `frontend/coverage/` is produced by `npx vitest run --coverage` (provider `@vitest/coverage-v8`), is gitignored, and was last generated 2026-06-15 — treat its numbers as stale until regenerated.
- `frontend/test-results/` and `frontend/playwright-report/` are Playwright output (gitignored). e2e config: `frontend/playwright.config.ts` — auto-starts the dev server on port 1111 with `VITE_MOCK=true`, `reuseExistingServer` outside CI, trace on first retry.
- Shakedown (`npm run shakedown`, config `frontend/shakedown/playwright.config.ts`) hits the LIVE sheet — run only deliberately; see `money-sheet-validation-and-qa`.
- Repo-root `.gitignore` ignores `*.png` (ad-hoc verification screenshots stay untracked).

## Provenance and maintenance

Re-verify before trusting; one line each:

| Fact | Command (repo root) |
|---|---|
| Dev port + strictPort + base path | `grep -n "port\|base" frontend/vite.config.ts` |
| Mock/auto-connect predicate | `grep -n "envMock\|VITE_GAS_URL" frontend/src/lib/connection.svelte.ts` |
| clasp build/push scripts | `grep -n '"build"\|"push"' clasp/package.json` |
| CI deploy steps + pinned deploymentId | `grep -n "clasp" .github/workflows/gas-deploy.yml` |
| Workflows trigger on main | `grep -n "branches" .github/workflows/*.yml` |
| READ/AUTH action sets | `grep -n "READ_ACTIONS\|AUTH_ACTIONS" clasp/src/lib/dispatch.ts` |
| Error envelope construction | `grep -n "unauthorized" clasp/src/lib/dispatch.ts` |
| Menu items | `grep -n "addItem" clasp/src/lib/menu.ts` |
| Weekly trigger day/hour/tz | `grep -n "SUNDAY\|atHour\|inTimezone" clasp/src/5_visibility.ts` |
| setup() scope | `sed -n 1,20p clasp/src/7_setup.ts` and `cat clasp/src/lib/setup.ts` |
| Frontend request timeout | `grep -n "REQUEST_TIMEOUT_MS" frontend/src/lib/adapter-real.ts` |
| Coverage staleness | `ls -ldT frontend/coverage` |
| Web app access/executeAs | `cat clasp/src/appsscript.json` |
