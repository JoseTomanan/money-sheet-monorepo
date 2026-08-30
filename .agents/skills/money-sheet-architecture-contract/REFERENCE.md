# Architecture Contract — Reference

Deep evidence for [SKILL.md](SKILL.md). All file:line references verified against
commit `7d46f0c` on 2026-07-10. If a line has drifted, re-run the provenance greps
in SKILL.md and update both files.

## ADR digests (all 10, `docs/adr/`)

**ADR-0001 — Unified INCOMING/OUTGOING sheet.** One sheet holds every Entry
regardless of Direction or date; a `Direction` column (`I`/`O`) distinguishes them,
and MASTER is a single formula-driven summary row. Rationale: the predecessor system
(one sheet per month + separate INCOMING sheet) forced GAS to create sheets on
rollover, maintain a per-month MASTER ledger, and keep a hardcoded
`masterHeaderLabels` array in sync with spreadsheet headers. Rejected alternative:
keeping per-month sheets. Consequence: GAS never creates sheets or writes MASTER;
the Categories-sheet VLOOKUP replaces the hardcoded label array; no "current month"
concept exists at the API layer.

**ADR-0002 — GAS web app HTTP API with shared-secret write auth.** `doGet` for
reads (unauthenticated), `doPost` for all mutations, gated by a shared secret in the
POST body checked against Script Properties `API_SECRET`. Rationale: avoids an OAuth
flow entirely; the frontend stores the secret in localStorage entered via Settings,
so multiple users can share one deployed URL, each pointing at their own spreadsheet.
Rejected alternative: full OAuth / Google Sign-In — explicitly deferred, to be
revisited if stronger auth is needed. Note: the ADR's action table includes
`getConfig` and `addEntries` (added via issue #111); the root CLAUDE.md table lists
`getSubcategoryBreakdown`, which does NOT exist in live dispatch — trust
`clasp/src/lib/dispatch.ts:354-418`.

**ADR-0003 — Plain Svelte 5 + Vite, no SvelteKit.** Static site on GitHub Pages;
all data fetching is client-side `fetch()` to the GAS URL. Rationale: the data
source is GAS, not a Node server, so SSR buys nothing. Rejected alternative:
SvelteKit — kept as the upgrade path if server-side proxying of the secret ever
becomes necessary. View switching is a component switcher, not file-based routing.

**ADR-0004 — Offline queue uses coalescing, not append-only.** Failed mutations
queue in localStorage `ms_queue`; a later op on the same logical entry merges into
or cancels the earlier item. The four rules: add+edit→merged add; add+delete→net
zero (both removed); edit+edit→merged edit; edit+delete→delete. Rejected
alternatives: (a) disallow edits on Local Entries — bad UX for the most common
offline case; (b) append ops and rewrite temp IDs at sync time — brittle, crash
mid-sync leaves inconsistent state. Coalescing keeps the queue always valid and
replayable with zero inter-item dependencies. **Amendment (issue #111):** a failed
`addEntries` queues as ONE `addBatch` item `{ tempIds, payloads }`; its legs are
**frozen** (read-only Local Entries, edit/delete blocked with a toast —
`mutationEngine.ts:173-177`) until the batch syncs. No fifth merge rule exists
because a batch leg never reaches `enqueue()` for edit/delete.

**ADR-0005 / ADR-0012 — Fund Redistribution and amount policy.** Moving budget
between Categories is two Incoming Entries: drain leg with negative amount (tag =
source Category), fill leg positive (tag = target Category). An Outgoing+Incoming
pair would require a structural `Redistribution` Subcategory under every Category,
polluting the namespace. Manual Entries accept every finite amount on either
direction; only the Fund Redistribution input policy requires a strictly positive
transfer amount. MASTER SUMIF absorbs negatives with no formula change.

**ADR-0006 — Tailwind CSS usage rules.** All shared CSS lives in `app.css`
(`@font-face`, `:root` tokens, resets, ALL `@keyframes`, ALL `@utility` blocks);
component `<style>` blocks are near-empty, permitted only for the inexpressible
(`color-mix()`, scrollbar pseudo-elements, JS-driven SVG props, tightly-coupled
state classes). Repeated class combos (3+ classes used 3+ times) become `@utility`
via `@apply`. Parent→child state styling uses `group-*`/`peer-*`, not reactive JS
variables. Inline `style=` only for runtime-computed values. Rejected alternative:
laissez-faire per-component styles — an audit found duplicated combos across 4–9
components and scattered keyframes.

**ADR-0007 — Prefer Shadcn Svelte over bespoke components.** When a UI primitive
exists in Shadcn Svelte (built on the already-present `bits-ui`), use it (components
are vendored into `src/lib/components/ui/` and freely editable) instead of
AI-generating a bespoke one. Rationale: bespoke implementations miss focus trapping,
aria, Escape/Tab handling, scroll locking; the EntrySheet migration was −90 net
lines. Bespoke stays legitimate when the primitive doesn't exist or the API diverges
too far (e.g. `dragGesture.ts` for multi-snap-point drag, which `Dialog` lacks).

**ADR-0008 — Atomic `addEntries` batch action.** Split Entries and Fund
Redistributions submit as ONE authenticated `addEntries` call: one document-lock
acquisition, one sheet read, all-or-nothing. Validate-then-write: every leg is
checked against the identical single-leg rules BEFORE the lock or any write; first
invalid leg rejects the whole batch. **No rollback path was built** — a write
failure after validation is deemed unreachable short of a Sheets outage (explicitly
rejected as out of scope). IDs assigned in array order as a contiguous block, leg 0
(main leg) lowest — replacing the frontend's old await-main-then-race choreography.
Descriptions stored verbatim: `^^` ditto and `[REDISTRIBUTE]` are frontend-only
conventions. Row insertion stays date-ordered leg-by-leg against the evolving sheet
state (`repository.ts:190-196`). Rejected alternative: N independent `addEntry`
POSTs — N× round-trips and orphaned legs on partial failure.

**ADR-0009 — Every INCOMING/OUTGOING mutation shares ONE document lock.** Root
cause of the blank-row mystery: the weekly separator/visibility trigger called
`insertRowBefore()` WITHOUT the document lock, shifting rows out from under an
in-flight `insertEntry` (which computes `targetRow` from a snapshot, then writes in
a separate step) — the request's own row stayed empty forever. Fix: extract
`runExclusive(lock, timeoutMs, fn)` (`clasp/src/lib/locking.ts:20`, unit-tested
try/finally around `waitLock`/`releaseLock`); ALL mutators — the four entry CRUD
actions in `2_entries.ts` AND `applyRowVisibilityForActiveSheet`
(`5_visibility.ts:130`) — route through it against the same
`LockService.getDocumentLock()`. Repo-wide invariant: any code path that inserts,
deletes, or shifts rows in INCOMING/OUTGOING must hold that lock for the full
read-modify-write. Related hardening: `planFieldWrites` groups field writes into
consecutive-column `setValues()` runs (skipping ARRAYFORMULA col D), narrowing —
not eliminating — the partial-row-write window. Rejected alternative: per-action
locking convention (the pre-fix status quo).

**ADR-0010 — onEdit trigger syncs Subcategory rename/delete.** An installable
(NOT default, not part of `runSetup()`) `onEdit` trigger on the Categories sheet
detects a **single-cell** edit to col B and, after a Yes/No count-naming
confirmation, bulk-rewrites matching Outgoing Tags: new name on rename, bare parent
Category on delete (reusing #123's bare-Category mechanism — rejected alternative:
an "Uncategorized" bucket). Pure logic in `clasp/src/lib/categorySync.ts`
(unit-tested, all GAS collaborators injected); GAS glue in `6_category_sync.ts`.
Multi-cell paste and whole-row delete are documented-unsupported (GAS `onEdit`
supplies no `oldValue` for them). Reparenting (col C edit) is a deliberate no-op —
col D's VLOOKUP re-resolves. Runs under the ADR-0009 lock; on lock timeout the
propagation is stashed and re-runnable via the "Retry last category sync" menu item.

## Invariant evidence detail

| Inv | Evidence |
|---|---|
| 1 | `checkTagDirection` (`dispatch.ts:165-183`): `I` requires tag ∈ Categories; `O` requires tag ∈ Subcategories ∪ Categories. `isValidTag` (`domain.ts:14-24`) mirrors it. Parity: `parity.test.ts:95` asserts `isValidTag ≡ (checkTagDirection === null)` over generated tag/direction pairs. |
| 2 | `1_sheets.ts:47` comment + code: `writeEntryFields` never writes `IO_COL.MAIN_CAT`; `repository.ts:50`: col D is never a plan key; `planFieldWrites` skips it (ADR-0009 hardening). MASTER is read-only to GAS (`3_master.ts` only reads). |
| 3 | `repository.ts:196` `insertEntries` / single-insert path: `nextId = max(existingIds)+1`; separator rows filtered by `isSeparatorRow` (blank col H). Separators created by `insertSeparatorIfMissing` (`5_visibility.ts:48`). `updateEntry` never touches col H. |
| 4 | `dispatch.ts` accepts every finite amount for add and update payloads. `entryAmount` allows all signs for manual Entries; `redistributionAmount` alone requires a strictly positive transfer (ADR-0012). |
| 5 | `dispatch.ts:386-392`: `validateAddBatchPayload` fully validates before `deps.addEntries`; `repository.ts:190-196` docblock: contiguous block, array order, leg 0 lowest, date-ordered interleaving. |
| 6 | `locking.ts:20` `runExclusive`; call sites: `2_entries.ts` (all four CRUD) and `5_visibility.ts:130`. |
| 7 | `weeks.ts:12` `weekStartOfStr` and `groupEntries.ts:10` `weekStartOf` — both pure YYYY-MM-DD string arithmetic, Sunday start, no Date-object host-TZ dependence. Parity: `parity.test.ts:54` (week-start) and `:65` (week-label). Tests run under both `TZ=UTC` and `TZ=Asia/Manila`. |
| 8 | `queue.ts:34-86` `enqueue`: add/addBatch push (line 37); edit merges into prior add/edit (57-77); delete cancels add or replaces edit (78+). Freeze: `mutationEngine.ts:173-177` filters `isBatchLegId` and toasts `BATCH_FROZEN_MESSAGE`. |
| 9 | `connection.svelte.ts:33` `mockMode` live predicate; `api.ts:25` `_override ?? (mockMode.current ? mockAdapter : realAdapter)` — evaluated per call, never captured at import (comment at `api.ts:21`). |
| 10 | `adapter-real.ts:21-31`: only file doing `instanceof ConnectionError/UnauthorizedError`; exports `isQueueable`/`isAuthError`/`userMessage`, re-exported at `api.ts:14`. (`adapter-real.test.ts:162` guards the convention.) |
| 11 | `mutationEngine.ts:39` `nextTempId(): number { return _nextId--; }` starting at `-1`; real GAS IDs are positive integers, so no collision. |

Cross-package wire-contract guards: `clasp/src/_contract_parity.ts` (type-level) and
`frontend/src/lib/wire-contract.parity.ts` (imports clasp source across packages —
`parity.test.ts:14-19` imports `../../../clasp/src/lib/weeks` and `.../dispatch`).

## Known-weak points — detail

- **Hardcoded category list** — `3_master.ts:19`:
  `["HOUSING","FOOD","TRANSIT","HEALTH","FINANCE","LIFESTYLE","MISC"]` filters MASTER
  header columns. A new Category added to the Categories sheet gets budgets in the
  spreadsheet but is silently dropped from the `getMaster` API response.
- **Two week-start algorithms** — deliberate (packages share no code) but only
  `parity.test.ts` keeps them equal. Any change to one MUST change the other and the
  test.
- **`deleteEntry` string-matching** — `dispatch.ts:413-414` maps errors by
  `msg.toLowerCase().includes("not found")`. Rewording the repository's throw
  message silently converts `not_found` into a 500-style `internal` error.
- **`getConfig` double-masking** — clasp returns `{}` when the Config sheet is
  missing (`8_config.ts:1-10`, intentional legacy tolerance); frontend
  `adapter-real.ts:140-147` `catch`es EVERYTHING (auth, network, parse) and returns
  `DEFAULT_CONFIG`. Real outages are indistinguishable from "no config set".
- **Three `Asia/Manila` copies** — `appsscript.json:2` (`timeZone`),
  `2_entries.ts:1` (`ENTRY_TZ`), `5_visibility.ts:1` (`MANILA_TZ`). Plus
  `frontend/src/lib/format.ts:17` hardcodes it for display. No single source.
- **Dead `week_start` key** — CONTEXT.md:79 documents it as a known Config key, but
  `lib/config.ts:2` seeds only `currency`/`nickname` and no code reads it. Weeks are
  hardcoded Sunday-start (invariant 7).
- **Hardcoded deploymentId, and TWO different ones** —
  `.github/workflows/gas-deploy.yml:31` bakes one ID into CI;
  `.claude/settings.json:22` permits a clasp deploy command with a DIFFERENT ID.
  Deploying to the wrong one updates a URL nobody's frontend points at.
- **Shared-secret auth** — checked at `dispatch.ts:347-348`; secret travels in the
  POST body and lives in browser localStorage. Reads are fully public. OAuth
  deferred per ADR-0002.
- **No rollback in `addEntries`** — ADR-0008 accepts a mid-batch write failure as
  unreachable-by-design; if a Sheets outage ever hits between legs, partial rows
  persist with no cleanup path.
