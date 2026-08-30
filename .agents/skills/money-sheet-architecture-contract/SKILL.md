---
name: money-sheet-architecture-contract
description: >-
  The binding architecture contract for money-sheet-monorepo: every load-bearing
  invariant with its enforcement point (file:line), the design decisions behind it
  (all 10 ADRs digested), and the known-weak points. Load this BEFORE changing
  validation, tag rules, week grouping, offline queue, adapters, or GAS write paths.
  Triggers: "is a bare Category valid on Outgoing?", "why is amount negative on an
  Incoming entry?", "who writes col D / MAIN CATEGORY?", checkTagDirection,
  isValidTag, weekStartOf vs weekStartOfStr diverging, parity.test.ts failing,
  "blank row appeared in INCOMING/OUTGOING", Entry ID reuse, addEntries atomicity
  or rollback, "Outgoing entries cannot have a negative amount", coalescing rules
  in queue.ts, addBatch frozen legs, Mock Mode not switching, ConnectionError /
  UnauthorizedError handling, "not_found" string matching in deleteEntry,
  getConfig returning defaults silently, Asia/Manila timezone constants,
  hardcoded category list in 3_master.ts, strip-exports / _*_globals.ts pipeline.
  No other skill may contradict this one.
---

# Architecture Contract — money-sheet-monorepo

Personal finances tracker: GAS (Google Apps Script) TypeScript backend over a Google
Sheet, Svelte 5 frontend. Two independent packages (`clasp/`, `frontend/`) sharing
zero code — shared algorithms are **implemented twice and parity-tested**.

Read `CONTEXT.md` for term definitions. This skill is the contract: if any other
skill, doc, or your own plan disagrees with an invariant below, this skill wins.
Full ADR digests, evidence, and weak-point detail: [REFERENCE.md](REFERENCE.md).

## Invariants (all verified as of 2026-07-10)

| # | Invariant | Enforced at |
|---|---|---|
| 1 | **Tag polymorphism**: Incoming tag must be a Category; Outgoing tag must be a Subcategory OR its bare parent Category (Subcategory optional, issue #123) | `clasp/src/lib/dispatch.ts:165` `checkTagDirection`; `frontend/src/lib/domain.ts:14` `isValidTag`; parity: `frontend/src/lib/parity.test.ts:95` |
| 2 | **GAS never writes MASTER or col D** (MAIN CATEGORY). Col D is ARRAYFORMULA-driven from row 2 in the sheet itself | `clasp/src/1_sheets.ts:47` (writeEntryFields skips col D); `clasp/src/lib/repository.ts:50` |
| 3 | **Entry ID (col H) is stable, never reused**: assigned max-existing+1 on insert, never touched by updateEntry. **Blank col H = week-separator row**, not an Entry | `clasp/src/lib/repository.ts` insert paths; separators: `clasp/src/5_visibility.ts:48` |
| 4 | **Every finite amount is valid on either direction** for manual Entries (ADR-0012). Fund Redistribution separately requires a strictly positive transfer amount. | `clasp/src/lib/dispatch.ts` finite-number validation; `frontend/src/lib/amountField.ts` |
| 5 | **`addEntries` is atomic**: validate-then-write, no partial writes, no rollback path (deemed unreachable, ADR-0008). IDs assigned in array order as a contiguous block — leg 0 (main leg) gets the lowest ID | `clasp/src/lib/dispatch.ts:386-391`; `clasp/src/lib/repository.ts:190-196` |
| 6 | **Every INCOMING/OUTGOING mutation holds the ONE document lock** via `runExclusive` — including the visibility/separator trigger (ADR-0009) | `clasp/src/lib/locking.ts:20`; `clasp/src/5_visibility.ts:130` |
| 7 | **Canonical week start = pure YYYY-MM-DD string arithmetic** (Sunday, no host-TZ dependence). Implemented twice, parity-tested | `clasp/src/lib/weeks.ts:12` `weekStartOfStr`; `frontend/src/lib/groupEntries.ts:10` `weekStartOf`; parity: `parity.test.ts:54` |
| 8 | **Offline queue coalesces** (add+edit→merged add; add+delete→net zero; edit+edit→merged; edit+delete→delete). **Exception: `addBatch` is frozen** — its legs are read-only until synced, never coalesced (ADR-0004 amendment) | `frontend/src/lib/queue.ts:34-86`; freeze: `frontend/src/lib/mutationEngine.ts:173-177` |
| 9 | **Mock Mode is one predicate**, adapter chosen per-call (never captured at import) | `frontend/src/lib/connection.svelte.ts:33-37`; `frontend/src/lib/api.ts:24-26` |
| 10 | **Error taxonomy owned by `adapter-real.ts`**: only it does `instanceof ConnectionError/UnauthorizedError`; everyone else uses its exported `isQueueable`/`isAuthError`/`userMessage` (re-exported via `api.ts:14`) | `frontend/src/lib/adapter-real.ts:21-31` |
| 11 | **Temp IDs are strictly negative and decreasing** (`-1, -2, …`), never collide with real IDs | `frontend/src/lib/mutationEngine.ts:39` `nextTempId` |

Wire-contract parity across packages: `clasp/src/_contract_parity.ts` (type-level) and
`frontend/src/lib/wire-contract.parity.ts` (imports clasp source cross-package).

## Architecture map

**clasp/** — GAS loads `dist/` files alphabetically into ONE global scope, no modules.
Numbered files (`0_types.ts` … `9_main.ts`) set load order. Pure logic lives in
`src/lib/*.ts` with ES exports (Vitest-testable); `scripts/strip-exports.js` strips
`export`/`import` post-build so they become globals. `_*_globals.ts` files declare
ambient types via `typeof import(...)` so numbered files can call lib functions
without imports — drift is a compile error. Only `lib/` is unit-testable; anything
touching `SpreadsheetApp`/`LockService` needs the real deployment.

**frontend/** — layering: components → store (`store.svelte.ts`) → gateway
(`api.ts`) → adapter (`adapter-real.ts` | `adapter-mock.ts`) → GAS. Mutations go
store → engine (`mutationEngine.ts`) → queue (`queue.ts`, localStorage `ms_queue`).
The two test seams: `EntryStoreSeam` (`mutationEngine.ts:11`, engine tested without
runes) and `setAdapter` override (`api.ts:28`).

**Live dispatch actions** (`clasp/src/lib/dispatch.ts:354-418`): getCategories,
getMaster, getEntries, getConfig, validate, addEntry, addEntries, updateEntry,
deleteEntry. (Root AGENTS.md's table drifts from this — trust dispatch.ts.)

## Known-weak points (state plainly; do not paper over)

| Weak point | Location |
|---|---|
| Hardcoded category list `["HOUSING","FOOD",…,"MISC"]` — new Categories sheet rows won't appear in MASTER parsing | `clasp/src/3_master.ts:19` |
| Two week-start algorithms (clasp + frontend); only the parity test keeps them equal | `weeks.ts:12` / `groupEntries.ts:10` |
| `deleteEntry` maps errors by string-matching `"not found"` in the thrown message | `clasp/src/lib/dispatch.ts:407-418` |
| `getConfig` masks ALL failures: clasp returns `{}` if sheet missing; frontend `catch` swallows everything → defaults | `clasp/src/8_config.ts:1-10`; `frontend/src/lib/adapter-real.ts:140-147` |
| Three `Asia/Manila` copies to keep in sync | `clasp/src/appsscript.json:2`, `2_entries.ts:1`, `5_visibility.ts:1` |
| Dead config key: `week_start` documented in CONTEXT.md:79 but never seeded (`lib/config.ts:2` seeds only currency/nickname) nor read | `CONTEXT.md:79` |
| Hardcoded GAS deploymentId in CI (and a *different* one in `.Codex/settings.json:22`) | `.github/workflows/gas-deploy.yml:31` |
| Shared-secret auth in POST body, secret in localStorage; OAuth explicitly deferred (ADR-0002) | `clasp/src/lib/dispatch.ts:347-348` |
| No rollback in `addEntries` — write failure after validation is accepted as unreachable (ADR-0008) | `clasp/src/lib/repository.ts:196` |

## When NOT to use this skill

This skill answers "what must hold and why". Go elsewhere for "how do I do X":

- **money-sheet-debugging-playbook** — symptom-to-triage runbooks for live failures
  (vanishing entries, zero budgets, disabled Save, lock timeouts).
- **money-sheet-change-control** — issue/ADR/commit/CI gating for making a change.
- **money-sheet-config-and-flags** — where any config key/env var/localStorage key lives.
- **money-sheet-failure-archaeology** — history of past incidents, reverts, dead ends.
- **sheets-gas-reference** — GAS/Sheets platform theory (why the runtime forces the
  numbered-file/strip-exports shape, LockService semantics, CORS/text-plain POSTs).

For Tailwind rules specifically, ADR-0006 is the source. Do not load this skill for
pure formatting/copy changes with no domain-logic surface.

## Provenance and maintenance

Verified against the repo at commit `7d46f0c` on 2026-07-10. Re-verify one-liners
(run from repo root):

```bash
grep -n "checkTagDirection" clasp/src/lib/dispatch.ts        # inv 1 (clasp)
grep -n "isValidTag" frontend/src/lib/domain.ts              # inv 1 (frontend)
grep -rn "ARRAYFORMULA" clasp/src                            # inv 2
grep -n 'must be a finite number' clasp/src/lib/dispatch.ts  # inv 4
grep -n "contiguous block" clasp/src/lib/repository.ts       # inv 5
grep -n "runExclusive" clasp/src/lib/locking.ts clasp/src/5_visibility.ts  # inv 6
grep -n "weekStartOfStr\|weekStartOf" clasp/src/lib/weeks.ts frontend/src/lib/groupEntries.ts  # inv 7
grep -n "addBatch" frontend/src/lib/queue.ts                 # inv 8
grep -n "mockMode" frontend/src/lib/connection.svelte.ts     # inv 9
grep -n "instanceof" frontend/src/lib/adapter-real.ts        # inv 10
grep -n "nextTempId" frontend/src/lib/mutationEngine.ts      # inv 11
grep -n 'action ===' clasp/src/lib/dispatch.ts               # live action list
ls docs/adr/                                                 # ADR inventory (10 as of 2026-07-10)
(cd frontend && npx vitest run src/lib/parity.test.ts)       # cross-package parity
```

If any grep comes back empty or on a different line, update this skill and
REFERENCE.md before relying on the claim.
