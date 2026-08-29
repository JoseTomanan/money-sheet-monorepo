# Failure archaeology — full chains and narratives

Companion to [SKILL.md](SKILL.md). Every SHA, date, issue, and PR below was checked
against `git log` / `gh` on 2026-07-10. Dates are commit dates (`%cs`). All commands
run from the repo root. Vocabulary (Entry, Tag, Category, Subcategory, Budget,
Split Entry, Fund Redistribution, Offline Queue, Local Entry, Mock Mode) is defined
in `CONTEXT.md` — read that first if any term is unfamiliar.

## Saga A — today()/UTC-vs-local date drift (#93 → #108, PR #114)

**Symptom.** Entries created near local midnight (Asia/Manila, UTC+8) landed on
"yesterday", vanished from the current-week view, or the week header disagreed with
the entries under it.

**Root cause.** "Today" was computed four different ways across the frontend, three
of them via `new Date().toISOString().slice(0, 10)` — which is UTC, so between
00:00 and 08:00 local it returns the previous calendar day. Separately (#93) the
clasp week-start used an instant-based computation while the frontend used pure
string arithmetic; the two disagreed at week boundaries.

**Chain (chronological).**

| SHA | Date | What |
|---|---|---|
| `9494859` | 2026-06-07 | Partial fix: local date in `currentWeekKey` only |
| `88aaa42` | 2026-06-15 | clasp: pure `weekStartOfStr`/`weekLabelFromStr` (string arithmetic, TZ-free) |
| `25c8552` | 2026-06-15 | Boundary + TZ-independence tests in both packages |
| `aafc52f` | 2026-06-15 | Canonical week-start definition documented in CONTEXT.md |
| `3fed561` | 2026-07-05 | `today()` helper with local-date semantics (`frontend/src/lib/format.ts`) |
| `de1e949` | 2026-07-05 | Entry form default date → `today()` |
| `6ad840b` | 2026-07-05 | Fund Redistribution date → `today()` |
| `c28b216` | 2026-07-05 | `currentWeekKey` derived from `today()` |
| `64bafa4` | 2026-07-05 | Mock fixture `daysAgo` → `today()` |
| `bc60d58` | 2026-07-06 | Squash-merge of PR #114 (single `today()` helper) |

**Status.** FIXED. Invariant now: date strings are TZ-free `YYYY-MM-DD`, produced
only by `today()`, compared as strings; `frontend/src/lib/parity.test.ts` pins
frontend `weekStartOf` ≡ clasp `weekStartOfStr`.

**Do not re-attempt.** Any second "today" source; any `toISOString().slice(0,10)`;
any Date-object comparison of entry dates.

## Saga B — split-toggle removal broke 7 e2e specs (#100/#102 → #104)

**Symptom.** 7 Playwright specs red on main immediately after PR #102 merged.

**Root cause.** PR #102 (`3d24db0`, "Remove split toggle, unify entry form on
SplitLegCarousel") deleted `.split-toggle-btn` and renamed per-field error elements
to `.leg-error`. Five specs still used the old selectors. Two more failed because
the unified carousel's amount field had lost bare-arithmetic typing: typing
`100-50` produced `10050` (the `-` was stripped on input).

**Chain.** `98f8721`/`b07549e`/`e14b217` (unification inside PR #102) →
`cc6b612` 2026-07-03 (repair specs) + `89284ae` 2026-07-03 (restore bare arithmetic).

**Status.** FIXED. The entry form is permanently unified: a 1-leg entry IS a 1-leg
Split Entry (`9468ed8` lowered the leg floor from 2 to 1).

**Do not re-attempt.** A split/simple mode toggle or a separate non-split form path.
After any entry-form markup change, run `npm run test:e2e` (cwd `frontend/`) before
declaring done — this saga is why.

## Saga C — arithmetic-in-amount-input evolution (#57 → #115)

The same feature regressed and was re-fixed three times before the logic had one home.

| SHA | Date | Step |
|---|---|---|
| `9550a82` | 2026-06-01 | #57/PR #63: evaluate Sheets-style formulas (`=100+50`, `SUM(…)`) on blur |
| `116650e` | 2026-06-20 | #101: allow `-` and bare arithmetic expressions (`100-50`) while typing |
| `89284ae` | 2026-07-03 | #104: restore bare arithmetic after carousel unification regressed it |
| `b6a5efc` | 2026-07-06 | Extract shared sanitise/resolve helpers |
| `48cab90` | 2026-07-06 | Split-leg carousel migrated to the shared helpers |
| `3affbce` | 2026-07-06 | #107/PR #115: Fund Redistribution amount field joins (it had been stripping operators) |

**Status.** FIXED. Evaluation rules live in `frontend/src/lib/formula.ts` (only `+`,
`-`, `SUM(…)` with literal args; `*/()` tolerated transiently while typing, rejected
on blur) and the shared amount-input helpers.

**Do not re-attempt.** A bespoke sanitiser in any new amount-bearing field. If a new
field needs money input, wire it to the shared helpers — the operator-stripping bug
shipped independently three times precisely because each field had its own copy.

## Saga D — orphaned Tag / bare Category on Outgoing (#123, PR #124; follow-up #126, ADR-0010)

**Symptom (four-headed).** After a user deleted or renamed a Subcategory row in the
Categories sheet: (1) editing any entry carrying the now-orphaned Tag was permanently
blocked — TWO independent validators rejected it (clasp `validateUpdatePayload` and
the frontend's `saveDisabled`); (2) the Tag picker had no way to select a bare
Category, a dead end; (3) that spend vanished from the "Where it went" breakdown;
(4) MASTER's VLOOKUP behavior on the orphaned Tag was unknown.

**Root cause.** Validation treated "Outgoing Tag must be a known Subcategory" as an
invariant, but the Categories sheet is hand-edited and nothing propagated edits, so
the invariant was never actually enforced at the data's source.

**Fix chain (PR #124, all 2026-07-08/10).** `f6f22fd` (clasp accepts bare Category on
Outgoing) → `ce565b9` (frontend validator matches) → `7e0e4de` (picker can commit a
bare Category) → `fd373bc` (breakdown counts bare-Category spend; `rankCategorySpend`
keys widened) → `7d46f0c` (CONTEXT.md: Subcategory is optional on Outgoing Tags).
Later `4d74c05` (2026-07-10) lets the pinned pill commit a bare Category directly.

**Follow-up (#126, ADR-0010, 2026-07-10).** PR #124 gave a one-entry-at-a-time
recovery path; #126 added the bulk path: an installable `onEdit` trigger
(`68955d3` pure logic in `clasp/src/lib/categorySync.ts`, `5f6a164` GAS binding in
`clasp/src/6_category_sync.ts`, `a5978dd` ADR, `25fc8ad` CONTEXT.md) that rewrites
matching Outgoing Tags when a Subcategory is renamed, or downgrades them to the bare
parent Category when deleted. Scope is deliberately single-cell edits only — GAS's
`onEdit` event lacks `oldValue`/`value` for paste/fill-down/row-delete, so those are
documented unsupported rather than silently mishandled.

**Status.** FIXED except **#123 item 4**, explicitly left OPEN: whether the live
MASTER VLOOKUP wraps in `IFERROR`, and whether an orphaned Tag yields `#N/A`
corrupting a whole Budget cell vs. silently excluding the row, is unverified —
formulas are sheet-owned; no code in this repo writes them.

**Do not re-attempt.** Re-adding a Subcategory-only rule for Outgoing Tags anywhere
(there are at least two validators plus the picker — they must all agree); an
"Uncategorized" bucket (rejected in ADR-0010 in favor of the bare-Category mechanism);
claiming item 4 fixed without testing against the live spreadsheet; extending the
trigger to multi-cell edits without solving the missing-oldValue problem ADR-0010
documents.

## Saga E — partial split failure → atomic addEntries (#46 → #111, PR #122, ADR-0008)

**Symptom.** A Split Entry submitted as N parallel `addEntry` POSTs; on GAS timeout
or lock contention some legs landed and some didn't — an orphaned half-split in the
sheet with no transactional boundary.

**Escalation path.**
1. Mitigation, PR #47 (#46): `Promise.allSettled` + partial-failure toast + retry.
   Surfaced the failure; did not remove it.
2. Sequencing, `b886d8a` 2026-06-17: submit the main leg first, then race the ditto
   legs — reduced but did not eliminate the window, and added choreography.
3. Root-cause elimination, #111 / PR #122 (all 2026-07-09): `24c1aa8` (clasp
   `addEntries`: one DocumentLock, one sheet read, validate-then-write — first
   invalid entry rejects the whole batch, IDs assigned in array order) → `1ce4e2c`
   (gateway/adapter/api surface) → `074f2fe` (frozen `addBatch` Offline Queue item —
   legs read-only until synced, `BATCH_FROZEN_MESSAGE`) → `e6d0b0c` (Split Entry and
   Fund Redistribution migrated to one atomic POST; the `b886d8a` choreography
   deleted) → `6955b28` (integration test: partial-failure characterization replaced
   with atomic contract) → `5421d16` (docs). Decision record: `docs/adr/0008`.

**Status.** FIXED. Note ADR-0008 deliberately has no rollback path: mid-batch write
failure after validation is deemed unreachable; do not add rollback machinery without
demonstrating a reachable failure.

**Do not re-attempt.** Per-leg submission; any multi-request write with an atomicity
requirement — extend `addEntries` instead; "unfreezing" queued `addBatch` legs for
editing before sync.

## Saga F — DocumentLock races on update/delete (#92, PR #96)

**Symptom.** During Offline Queue drains (several mutations fired back-to-back),
updates/deletes could hit the wrong row.

**Root cause.** `updateEntry`/`deleteEntry` scanned the sheet for the Entry ID, then
mutated by row index, with NO lock — while `addEntry` held one. Any concurrent row
insert/delete between scan and mutate shifted indices.

**Fix.** `b784f7f` 2026-06-15 (pure `findRowByEntryId`, fully unit-tested) →
`2b438ab` 2026-06-15 (acquire DocumentLock → resolve row → mutate → release in
`finally`). Later generalized by Saga H / ADR-0009.

**Do not re-attempt.** Resolving a row index outside the lock window. A row index is
only meaningful while the lock that observed it is still held.

## Saga G — getMaster all-zeros + col-D formula revert (#15, `61443db`)

**Symptom.** Production `getMaster` returned `{onHand: 0, budgets: {}}` while the
MASTER sheet visibly held correct values.

**Root cause.** MASTER's headers live in non-contiguous columns; the reader's
assumptions about layout failed silently instead of erroring.

**Related revert.** `61443db` 2026-05-23: GAS had been writing a per-row VLOOKUP
formula into col D on every insert; reverted — col D is one `ARRAYFORMULA` in D2,
owned by the sheet. This is why Saga H's `584b8ba` writes entry fields as two
contiguous runs (B:C and E:H) skipping col D, and why `frontend` store-sync tests
assert `mainCategory` is non-empty (canary for a broken D2 formula).

**Status.** FIXED, with a standing weak point: `clasp/src/3_master.ts` hardcodes a
7-name category allow-list and silently drops unknown MASTER columns (see
`money-sheet-architecture-contract`).

**Do not re-attempt.** Making GAS write formulas into INCOMING/OUTGOING or MASTER.
"GAS never writes to MASTER" and "col D is sheet-owned" are contract, not habit.

## Saga H — blank-row race: visibility trigger vs entry writes (PR #125, ADR-0009)

**Symptom.** A permanently blank, ID-less row appeared inside INCOMING/OUTGOING.
Invisible to the frontend (everything keys off Entry ID, and blank col H is the
week-separator marker), but it corrupted separator bookkeeping.

**Root cause.** The weekly Autohide/visibility trigger (`5_visibility.ts`) called
`insertRowBefore()` WITHOUT the document lock. It could land between an in-flight
`addEntry`'s row insert and its field writes, shifting the target row.

**Fix (all 2026-07-10, PR #125).** `c3812cc` (shared `runExclusive` helper,
`clasp/src/lib/locking.ts`) → `e8d4ef1` (trigger serialized under the same lock) →
`584b8ba` (field writes as atomic contiguous-column `setValues` runs) → `24fada0`
(ADR-0009: ALL IO-sheet row mutations share one lock).

**Do not re-attempt.** Any IO-sheet row insert/delete/shift outside `runExclusive` —
including future triggers. The category-sync trigger (Saga D follow-up) already
follows this rule.

## Reverts — extended detail

**Skeleton loading (#60 → PR #85 → #86).** Forward: `20444a9` (skeleton-sweep +
radar-ping keyframes, Skeleton primitive), `478f04b`, `76015d6` (PR #85,
differentiated cold-load/master-refresh/sync states). Owner rejected the result;
#86 reverted wholesale: `aab0039` (remove Skeleton primitive, keyframes, Money
tween), `6275c36` (restore shimmer in HomeScreen/SummaryView — kept only the
divider fix), `7a28e68` (restore shimmer test assertions). **Shimmer is the settled
loading treatment** (`@keyframes shimmer` in `frontend/src/app.css`).

**Money roll animation.** `f8de720` removed the 0→value count-up (it animated from 0
on every cold load, misreading cache-first init as a change) → `193676e` accidental
revert during a merge → `8d0c1b0` re-removed it → `aab0039` deleted the tween
entirely. Money now renders the value directly; if anyone ever re-adds a tween, it
must initialize to the actual value and animate only on refresh — but the settled
answer is: no tween.

**Auto-advance week (#84).** `84983a6` made the Entries view open on the latest week
*containing entries*; `53c8c07` reverted same day — the issue meant the current
calendar week. Settled semantics: `selectedWeek` initializes to `currentWeekKey()`
(see `frontend/src/lib/entriesFilter.svelte.ts`), even when that week is empty.

**Design thrash.** `bcfc3b0` restored the amber accent, `54e4307` restored single
column on desktop/tablet, `13c410a` restored the cat dot + card shadows. The current
look is a deliberate endpoint, not a default.

## Refactor campaigns (settled)

| Campaign | Issues → PRs | Landed | One-line outcome |
|---|---|---|---|
| Store deepening | #55 → PR #56 (also #22 earlier) | 2026-05 | Store god-module split into domain/aggregations/payload modules |
| Adapter + dispatcher | #88, #89, #90 → PR #94 (coverage→91%, `618d928`); #91 (+ fixes #92, #93) → PR #96 | 2026-06 | Gateway adapters behind one seam; offline-mutation lifecycle module; Category knowledge module; validated clasp dispatcher with error envelope |
| 2026-07-05 audit | #105→PR #116, #106→#117, #107→#115, #108→#114, #109→#120, #110→#121, #111→#122, #112→#118, #113→#119 | 2026-07 | Error taxonomy behind adapter; store split; AmountField; today(); wire-contract parity; IO repository; atomic batch; one Mock predicate; view-math extraction |

These are settled: re-proposing "split the store", "unify the adapters", or "pin the
wire contract" duplicates finished work — check `git log --grep` for the issue number
first.

## Provenance and maintenance

Verified 2026-07-10 (cwd repo root). Re-verify before relying on any row above:
- Any SHA: `git log -1 --format="%h %cs %s" <sha>`.
- Any issue/PR: `gh issue view <n> --json state,title` / `gh pr view <n> --json state,title`.
- Chains still tell the whole story: `git log --oneline --since=2026-07-10` for anything newer than this file.
- ADR-0008 no-rollback stance: `grep -n -i "rollback" docs/adr/0008-atomic-batch-add-entries.md`.
- ADR-0010 single-cell scope: `grep -n "numRows" clasp/src/lib/categorySync.ts`.
- Skeleton stays dead: `git log --oneline -i --grep="skeleton" -3` (newest hits should still be the 2026-06-11 reverts).
