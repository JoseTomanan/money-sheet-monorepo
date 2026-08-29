# GAS & Sheets deep reference (money-sheet)

Companion to [SKILL.md](SKILL.md). Verified against the repo as of 2026-07-10
unless a claim is explicitly labeled platform knowledge or unverified.

## 1. Deployment model in detail

Terms:

- **Script project** — the container GAS hosts. Identified by `scriptId` in
  `clasp/.clasp.json` (committed; not a secret).
- **Version** — an immutable snapshot of the script's code.
- **Deployment** — a stable endpoint (the `/exec` URL) pinned to one version.
  One project can have many deployments; each has its own URL and ID.
- **HEAD deployment** — the special `/dev` URL that always runs latest pushed
  code; requires Google login, so the frontend cannot use it.

The pipeline (`.github/workflows/gas-deploy.yml`, triggers on push to `main`
filtered to `clasp/**`):

```
npm run build                     # tsc → dist/, strip-exports, copy appsscript.json
npx @google/clasp push -f         # upload dist/ (rootDir: ./dist in .clasp.json) to HEAD
npx @google/clasp deploy --deploymentId <hardcoded id> --description "Frontend API"
```

- `push -f` overwrites remote HEAD without the local-newer check. It does NOT
  change what `/exec` serves.
- `deploy --deploymentId` creates a new version and repoints the EXISTING
  deployment at it — the `/exec` URL users saved keeps working. Running plain
  `clasp deploy` (no id) would mint a NEW deployment with a NEW URL that no
  client knows about. The deployment ID being hardcoded in the workflow is a
  known weak point (single deployment, single environment).
- Symptom "pushed code but live behavior unchanged" ⇒ push happened, deploy
  didn't (or you hit a different deployment).
- Manual equivalents and credentials handling: `money-sheet-run-and-operate`.

## 2. Request lifecycle quirks (why the frontend looks odd)

| Quirk | Mechanism | Code evidence |
|---|---|---|
| POST body is `text/plain` | GAS web apps never answer `OPTIONS`, so a preflighted request dies with a CORS error. `text/plain` is one of the three CORS "simple request" content types, so the browser skips preflight. (Platform knowledge — long-standing documented GAS behavior; no repo file states it.) | `frontend/src/lib/adapter-real.ts` `gasPost`/`validateConnection` set `"Content-Type": "text/plain"`; `doPost` parses `e.postData.contents` regardless |
| `redirect: "follow"` everywhere | `/exec` answers with a 302 to a one-time `script.googleusercontent.com` URL carrying the real body | `adapter-real.ts:96,108,119` |
| `cache: "no-store"` + `&t=Date.now()` on GETs | The googleusercontent hop can serve cached bodies; both belts defeat it | `adapter-real.ts` `gasGet` |
| Errors always ride HTTP 200 | ContentService cannot set status codes; the envelope `{ok:false, error, code, message}` (code ∈ auth\|validation\|not_found\|internal) is the only signal | `clasp/src/lib/dispatch.ts`; `9_main.ts` `apiJson` |
| Secret in body, not header | Custom headers would also trigger preflight; `secret` is merged into the JSON body | `adapter-real.ts` `gasPost`; `dispatch.ts` auth gate |

Auth wiring: `doGet` passes `e.parameter.secret`, `doPost` passes `body.secret`;
`dispatch` compares against Script Property `API_SECRET` (read fresh per request
in `9_main.ts` `apiDeps()`). READ_ACTIONS (`getEntries`, `getMaster`,
`getCategories`, `getConfig`) skip the gate; AUTH_ACTIONS (`validate`,
`addEntry`, `addEntries`, `updateEntry`, `deleteEntry`) require it. Unknown
actions are rejected as `internal` BEFORE the auth gate (`dispatch.ts:340-344`)
so they never masquerade as auth failures.

## 3. Quotas, limits, cold starts

Quota classes that apply to this project. **Numbers drift — treat the labels
seriously and re-check https://developers.google.com/apps-script/guides/services/quotas
before relying on any figure.**

| Class | What it gates | Status of numbers |
|---|---|---|
| Script runtime per execution | Any single doGet/doPost/trigger run | Google-published: 6 min/execution for consumer accounts (as of knowledge cutoff — re-verify) |
| Simultaneous executions | Concurrent requests per user/script | Google-published class; the commonly cited figure is 30 per user — treat as unverified until re-checked |
| Triggers total runtime per day | The weekly visibility trigger | Google-published class; exact daily figure unverified here |
| Web app "custom function"/URL quotas | Daily call volume | Google publishes per-account daily quotas; none measured for this project |
| LockService wait | `waitLock(10_000)` throws after 10 s of contention | Repo-verified: 10_000 ms at every call site (`2_entries.ts:25,32,46,52`, `5_visibility.ts:130`) |
| Cold starts | First request after idle spins up a new V8 instance; observed as multi-second p99 latency | Not quantified in this repo — measure, don't guess (`money-sheet-diagnostics-and-tooling`) |

Client-side reality check: the frontend aborts any request after 15 s
(`REQUEST_TIMEOUT_MS = 15_000`, `adapter-real.ts:48`) and treats it as a
`ConnectionError` (queueable). So a GAS execution may still complete server-side
after the client gave up — mutations are not idempotent-by-retry; the Offline
Queue's coalescing (ADR-0004) and Entry ID readback are what keep this sane.

### LockService semantics (repo-verified + platform knowledge)

- `getDocumentLock()` — one lock per spreadsheet document, shared across ALL
  concurrent executions of the script (any user, any trigger).
- `waitLock(ms)` blocks up to `ms`, then **throws** (it does not return false).
  In `runExclusive` (`clasp/src/lib/locking.ts`) a wait-timeout means `fn` never
  runs and no release is attempted; otherwise release happens in `finally`.
- Reads (`getEntries`, `getMaster`, …) take no lock — they can observe a
  mid-mutation sheet in principle; separator rows and blank-H filtering make
  this benign for entries (see ADR-0009 for the one race that wasn't).
- One lock spans a whole `addEntries` batch (ADR-0008): validate-then-write, no
  partial writes.

## 4. Sheets formula layer — the parts code cannot see

The spreadsheet template owns all formulas. Nothing in this repo writes them
(`lib/setup.ts` seeds only Config; `setup()` does NOT create INCOMING/OUTGOING,
MASTER, or Categories — those come from the template).

- **Col D**: ARRAYFORMULA-driven VLOOKUP from Tag (col C) into the Categories
  sheet, resolving Subcategory→Category (and Category→itself for Incoming/bare
  Category Tags). History: per-row `setFormula` from GAS was reverted
  (`61443db`) because a single sheet-side ARRAYFORMULA is the design; GAS
  flushes and reads D back post-insert to return `mainCategory`.
- **MASTER row 3**: ON HAND + per-Category Budget cells, SUMIF-style aggregation
  keyed on col D (Outgoing) and col C (Incoming). `getMaster`
  (`clasp/src/3_master.ts`) reads headers from row 2, data from row 3, and only
  accepts the seven hardcoded Category names — an unknown MASTER column is
  silently dropped (known weak point, `3_master.ts:19`).
- **#N/A question (issue #123, item 4 — OPEN as of 2026-07-10)**: when a Tag is
  orphaned (its Categories row deleted), VLOOKUP in col D yields `#N/A` unless
  IFERROR-wrapped. Unknown against the live sheet: (a) is it IFERROR-wrapped?
  (b) does a `#N/A` inside a SUMIF range poison the whole Budget cell to `#N/A`,
  or does SUMIF skip error cells? Do not assert either behavior — verify on the
  live spreadsheet before building on it. If a Budget cell reads `#N/A`,
  `getMaster` coerces it via `Number(...) || 0`, so the symptom downstream is a
  silently zeroed Budget, not an error.
- **Categories merged cells**: col C merges one Category label across all its
  Subcategory rows; `getValues()` yields the label only in the first merged
  cell (rest are `""`), hence the `currentCategory` carry-down walk in
  `4_categories.ts`.
- **Config dropdown chips**: constrained-choice Config values (e.g. the reserved
  `week_start`) use Sheets' dropdown-chip data validation on the value cell —
  applied by hand in the sheet, invisible to code (CONTEXT.md:79). Note
  `week_start` is documented but currently dead: not seeded, not read (reserved
  for open issue #87).

## Provenance and maintenance

All claims verified 2026-07-10. One-line re-verification commands (run from repo root):

```bash
grep -n "READ_ACTIONS\|AUTH_ACTIONS" clasp/src/lib/dispatch.ts        # action sets, lines ~318/322
grep -n "runExclusive(LockService" clasp/src/2_entries.ts clasp/src/5_visibility.ts  # 10_000 ms lock sites
sed -n 133,145p clasp/src/5_visibility.ts                              # weekly SUNDAY atHour(1) trigger
cat clasp/src/appsscript.json                                          # V8, Asia/Manila, USER_DEPLOYING, ANYONE_ANONYMOUS
cat clasp/.clasp.json                                                  # rootDir ./dist
sed -n 1,25p clasp/scripts/strip-exports.js                            # export/import stripping
grep -n "text/plain\|redirect" frontend/src/lib/adapter-real.ts        # CORS-simple POST, redirect follow
grep -n "REQUEST_TIMEOUT_MS" frontend/src/lib/adapter-real.ts          # client 15 s timeout
grep -n "deploymentId" .github/workflows/gas-deploy.yml                # deploy pipeline
grep -n "DEFAULT_CONFIG_ROWS" clasp/src/lib/config.ts                  # seeded Config keys
sed -n 60,80p CONTEXT.md                                               # sheet layout tables + Config keys
grep -n "installCategorySyncTrigger\|oldValue" clasp/src/6_category_sync.ts  # onEdit trigger + limitation
gh issue view 123 --json state -q .state                               # #N/A remainder still tracked (issue CLOSED; item 4 noted open in body)
```

Volatile external facts (Google quota numbers, cold-start behavior) must be
re-checked against Google's quota page and measured via
`money-sheet-diagnostics-and-tooling` — never trust the figures above blind.
