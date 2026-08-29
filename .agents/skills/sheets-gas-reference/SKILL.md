---
name: sheets-gas-reference
description: Domain-theory reference for Google Apps Script (GAS) and Google Sheets as THIS repo uses them. Load to understand WHY the code is shaped this way — GAS's no-module global-concat runtime (numbered files 0_types.ts…9_main.ts, scripts/strip-exports.js), web app model (doGet/doPost, ContentService JSON, /exec URLs, deployments vs versions, executeAs USER_DEPLOYING, ANYONE_ANONYMOUS), Script Properties API_SECRET, LockService DocumentLock/waitLock/runExclusive semantics, time-based and onEdit triggers, quotas and cold starts, why POSTs use Content-Type text/plain (CORS preflight), why fetch needs redirect:"follow", the .clasp.json rootDir/clasp push -f/deploy --deploymentId toolchain, and the Sheets formula layer (ARRAYFORMULA VLOOKUP in col D, SUMIF in MASTER, merged cells in Categories, the open #N/A-on-orphaned-Tag question, #123). Symptoms: "X is not defined" at runtime, "Cannot use import statement", CORS error in console, 302/redirect on /exec, "unauthorized", waitLock timeout, stale code after push.
---

# Sheets & GAS platform reference (money-sheet)

Conceptual knowledge pack: how Google Apps Script and Google Sheets actually behave,
scoped to this repo's usage. Facts verified against the repo as of 2026-07-10.

## GAS runtime model — one global scope, no modules

- GAS (V8 runtime, `"runtimeVersion": "V8"` in `clasp/src/appsscript.json`) loads
  **all `dist/*.js` files alphabetically into a single global scope**. There is no
  module loader; `import`/`export` are syntax errors at runtime.
- Numeric prefixes (`0_types.ts` … `9_main.ts`) force load order so earlier
  definitions exist when later files reference them (`clasp/AGENTS.md`).
- `clasp/src/lib/*.ts` are real ES modules (so Vitest can import them). The build
  (`npm run build` = `tsc` + `node scripts/strip-exports.js`) strips `export `
  keywords and relative `import {…} from "./…"` lines from `dist/lib/*.js`,
  turning them into plain globals. **Never hand-edit `clasp/dist/` or push without
  the build step** — see `money-sheet-change-control`.
- Consequence: every top-level function/const in every file shares one namespace.
  Name collisions silently shadow; "X is not defined" at runtime usually means a
  load-order or strip-exports problem.
- `_*_globals.ts` files are ambient `declare` mirrors (derived via
  `typeof import("./lib/…")`) letting the numbered non-module files call lib
  functions type-safely. They are `.ts` not `.d.ts` because `skipLibCheck: true`
  would skip checking `.d.ts` (issue #109).

## Web app model — doGet/doPost, deployments, URLs

- Entry points live in `clasp/src/9_main.ts`: `doGet` (reads, query params) and
  `doPost` (mutations, JSON body). Both return
  `ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)`.
  GAS web apps cannot set arbitrary status codes or headers — errors travel in the
  JSON envelope `{ok:false, error, code, message}` with HTTP 200.
- `clasp/src/appsscript.json`: `executeAs: "USER_DEPLOYING"` (script runs as the
  owner, so anonymous callers can touch the owner's spreadsheet) and
  `access: "ANYONE_ANONYMOUS"` (no Google login needed). Auth is the app-level
  shared secret instead (ADR-0002).
- **Deployments vs versions**: `clasp push -f` only updates the script's HEAD code.
  The stable `/exec` URL serves a *deployment* pinned to a *version*; CI runs
  `npx @google/clasp deploy --deploymentId <id>` (hardcoded in
  `.github/workflows/gas-deploy.yml`) to cut a new version onto the SAME
  deployment so the URL never changes. Push without deploy = live URL serves
  stale code. Details: REFERENCE.md §1.
- `/exec` responses **HTTP-redirect (302)** to `script.googleusercontent.com` —
  the frontend sets `redirect: "follow"` on every fetch
  (`frontend/src/lib/adapter-real.ts`).
- **CORS**: GAS web apps do not answer `OPTIONS` preflight requests, so the
  frontend POSTs with `Content-Type: text/plain` — a CORS "simple request" that
  skips preflight (platform behavior; code evidence `adapter-real.ts` `gasPost`).
  `doPost` ignores the content type and `JSON.parse`s `e.postData.contents`.

## Platform services as used here

| Service | Usage here | Key semantics |
|---|---|---|
| Script Properties | `API_SECRET`, set by `setup()` via `Utilities.getUuid()` (`clasp/src/7_setup.ts`, `lib/setup.ts`) | Per-script key-value store; not in git; read each request in `apiDeps()` |
| LockService | `LockService.getDocumentLock()` + `runExclusive(lock, 10_000, fn)` (`lib/locking.ts`) on every INCOMING/OUTGOING mutation AND the visibility trigger (ADR-0009) | `waitLock(ms)` blocks up to ms then **throws**; document lock is spreadsheet-wide across all concurrent executions; reads take no lock |
| Time-based triggers | `installWeeklyVisibilityTrigger()` (`5_visibility.ts:133`): weekly, `SUNDAY`, `atHour(1)`, `inTimezone(MANILA_TZ)`; installed from the sheet menu | Fire "at hour" = anytime within that hour; run as the installing user; delete-then-recreate pattern avoids duplicates |
| Installable onEdit trigger | `installCategorySyncTrigger()` (`6_category_sync.ts:54`) binds `onEditCategorySync` to Categories-sheet edits (ADR-0010); optional, NOT part of `setup()` | Handler deliberately not named `onEdit` (that reserved simple-trigger name runs without auth to show UI/write cross-sheet). `e.oldValue` exists ONLY for single-cell edits — row deletes and multi-cell pastes fire with no oldValue, so propagation silently skips them (accepted limitation, ADR-0010) |
| Quotas / cold starts | See REFERENCE.md §3 — quota classes with Google-published vs unverified labels. Frontend imposes its own 15 s timeout (`REQUEST_TIMEOUT_MS`, `adapter-real.ts:48`) | Never invent quota numbers; measure with `money-sheet-diagnostics-and-tooling` |

## Spreadsheet layout (from CONTEXT.md — canonical)

| Sheet | Layout |
|---|---|
| INCOMING/OUTGOING | One row per Entry: `B=DATE \| C=TAG \| D=[VLOOKUP] MAIN CATEGORY \| E=DESCRIPTION \| F=I/O \| G=AMOUNT \| H=ENTRY ID`. Blank col H = week-separator row (`lib/repository.ts` `isSeparatorRow`) |
| MASTER | Single summary row (**always row 3**; row 2 = headers — never `getLastRow()`): ON HAND + one Budget column per Category. Formula-driven; GAS read-only |
| Categories | `B=Subcategory`, `C=parent Category` as a **merged cell** spanning its subcategories. `getValues()` returns the merge value only in its first cell, so `4_categories.ts` carries `currentCategory` down rows |
| Config | 2-column key-value (`A=key`, `B=value`). Seeded by `ensureConfigSheet` with `currency`="₱", `nickname`="" (`lib/config.ts:2`). Constrained-choice values use Sheets dropdown-chip validation, applied manually in the sheet |

## Formula layer — what GAS never touches

- **Col D (MAIN CATEGORY)** is a single ARRAYFORMULA-driven VLOOKUP living in the
  sheet, not in code (per-row `setFormula` was reverted in `61443db`). GAS never
  writes col D; after insert it calls `SpreadsheetApp.flush()` and reads D back
  (`1_sheets.ts:55-56`).
- **MASTER** aggregates via SUMIF over col D / col C (ADR-0005 confirms SUMIF sums
  negative amounts correctly for Fund Redistribution). Exact formulas are
  template-only — not code-managed, not in this repo.
- **Open question (#123 item 4, still open as of 2026-07-10)**: whether the live
  VLOOKUP is IFERROR-wrapped, and whether an orphaned Tag's `#N/A` in col D
  corrupts a whole SUMIF Budget cell or just drops that row. Must be checked
  against the live spreadsheet. Details: REFERENCE.md §4.

## When NOT to use this skill

- Running dev servers, pushing/deploying, spreadsheet menu ops → `money-sheet-run-and-operate`.
- Measuring latency, cold starts, lock contention → `money-sheet-diagnostics-and-tooling`.
- Attacking GAS platform limits as a project → `money-sheet-gas-limits-campaign`.
- Config keys / env vars / localStorage inventory → `money-sheet-config-and-flags`.
- Recreating the toolchain from scratch → `money-sheet-build-and-env`.
- Triage of a live failure symptom → `money-sheet-debugging-playbook`.

Deep dive + "Provenance and maintenance": [REFERENCE.md](REFERENCE.md).
