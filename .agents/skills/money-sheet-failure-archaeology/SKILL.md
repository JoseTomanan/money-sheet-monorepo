---
name: money-sheet-failure-archaeology
description: The historical chronicle of every major money-sheet investigation, dead end, rejected fix, and revert — symptom → root cause → evidence (SHAs, issues, PRs) → status, plus what must NOT be re-attempted. Consult BEFORE proposing a fix, feature, or refactor to check whether it was already tried and reverted. Triggers, entries vanish or land in the wrong week near midnight (toISOString/UTC drift #108); 7 e2e specs failing after split-toggle removal (.split-toggle-btn, #104); typing "100-50" becomes 10050 in the amount input (#115); editing an entry permanently blocked after deleting a Categories row / orphaned Tag / bare Category (#123); MASTER VLOOKUP #N/A; half a Split Entry saved (partial failure, atomic addEntries #111); blank ID-less row in INCOMING/OUTGOING (#125, ADR-0009); getMaster returns onHand 0 and empty budgets (#15); DocumentLock races (#92); proposals for skeleton loaders, auto-advance week, Money count-up animation (all reverted).
---

# money-sheet failure archaeology

Chronicle of settled battles in this repo. Before you propose a change, grep this
file's DO-NOT list — several "obvious" ideas were tried and reverted. Every SHA and
issue number below was verified against `git log` / `gh` on 2026-07-10. Full commit
chains and narrative: [REFERENCE.md](REFERENCE.md).

Verify any citation yourself (cwd: repo root):
```bash
git log -1 --format="%h %ci %s" <sha>        # confirm a SHA
gh issue view <n> --json title,state,body    # confirm an issue
gh pr view <n> --json title,state            # confirm a PR
```

## Saga index

| # | Saga | Evidence | Status (2026-07-10) |
|---|------|----------|---------------------|
| A | today()/UTC-vs-local date drift | #93, #108, PR #114; `9494859`, `3fed561`…`bc60d58` | FIXED — single `today()` in `frontend/src/lib/format.ts` |
| B | Split-toggle removal broke 7 e2e specs | #100, #102, #104; `cc6b612`, `89284ae` | FIXED |
| C | Arithmetic-in-amount-input evolution | #57, PR #63, #101, #104, #107, PR #115; `9550a82`…`3affbce` | FIXED — shared sanitise/resolve helpers |
| D | Orphaned Tag / bare Category on Outgoing | #123, PR #124, #126, ADR-0010; `f6f22fd`…`7d46f0c`, `68955d3`, `5f6a164` | FIXED except #123 item 4 (MASTER #N/A) — explicitly left OPEN |
| E | Partial split failure → atomic addEntries | #46, #111, PR #47, PR #122, ADR-0008; `24c1aa8`…`5421d16` | FIXED — root cause eliminated |
| F | DocumentLock races on update/delete | #92, PR #96; `b784f7f`, `2b438ab` | FIXED |
| G | getMaster all-zeros + col-D formula revert | #15; `61443db` | FIXED; 7-name allow-list in `clasp/src/3_master.ts` remains a known weak point |
| H | Blank-row race: visibility trigger vs entry writes | PR #125, ADR-0009; `c3812cc`, `e8d4ef1`, `584b8ba` | FIXED — all IO-sheet row mutations share one lock |

## Sagas (compact)

**A — today() drift.** Symptom: entries vanished from "today"/current week near local
midnight. Root cause: "today" computed 4 different ways, 3 via `toISOString()` (UTC).
Partial fix `9494859`; durable fix = single local-wall-clock `today()` helper
(`3fed561`→`bc60d58`, PR #114). Upstream week-start alignment (#93): pure
`weekStartOfStr` in clasp (`88aaa42`) + TZ-independence tests (`25c8552`) + canonical
definition in CONTEXT.md (`aafc52f`). **DO NOT** reintroduce `toISOString().slice(0,10)`
or any second "today" source; date strings are TZ-free `YYYY-MM-DD`, compared as strings.

**B — split-toggle e2e breakage.** PR #102 deleted `.split-toggle-btn` and renamed error
elements to `.leg-error`; 5 specs used stale selectors, 2 lost bare-arithmetic typing
(`100-50` → `10050`). Fix: `cc6b612` (selectors) + `89284ae` (bare arithmetic). **DO NOT**
re-add a split-mode toggle — the entry form is permanently unified on SplitLegCarousel
(a 1-leg entry is just a 1-leg split). Run `npm run test:e2e` after any form-markup change.

**C — amount-input arithmetic.** Sheets-style formulas on blur (`9550a82`, #57/PR #63) →
allow `-`/bare expressions (`116650e`, #101) → regressed by carousel unification, restored
(`89284ae`, #104) → helpers extracted to one place (`b6a5efc`+`48cab90`) → Fund
Redistribution field joined (`3affbce`, #107/PR #115). **DO NOT** write a bespoke
sanitiser in any new amount field — use the shared helpers in
`frontend/src/lib/formula.ts` / AmountField; the same bug shipped three times before
they existed.

**D — orphaned Tag / bare Category.** Deleting a Categories-sheet row orphaned existing
Tags: edits permanently blocked (TWO independent validators — clasp
`validateUpdatePayload` and frontend `saveDisabled`), picker dead-end, spend dropped
from "Where it went". Fix chain `f6f22fd`→`ce565b9`→`7e0e4de`→`fd373bc`→`7d46f0c` (PR
#124): Outgoing now accepts Subcategory OR bare Category. Follow-up #126 (ADR-0010,
`68955d3`+`5f6a164`, 2026-07-10) adds an installable onEdit trigger that bulk-rewrites
Outgoing Tags when a Subcategory is renamed/deleted in the Categories sheet —
single-cell edits only; paste/fill-down/row-delete are documented as unsupported, not
silently mishandled. **Item 4 of #123 is deliberately unfixed**: whether an orphaned Tag
makes MASTER's VLOOKUP emit `#N/A` and corrupt a Budget cell is unknown — formulas are
sheet-owned, not code-managed. **DO NOT** mark it fixed without testing against the live
spreadsheet; **DO NOT** re-add a Subcategory-only rule for Outgoing Tags; **DO NOT**
"extend" the trigger to multi-cell edits without reading ADR-0010's rejected options.

**E — atomic addEntries.** Splits submitted as N parallel `addEntry` calls → timeouts
orphaned half-splits. First mitigation only surfaced the failure (PR #47,
allSettled+retry toast). Root-cause elimination (#111, PR #122, ADR-0008):
`24c1aa8`→`5421d16` — one batch action, one lock, one read, validate-then-write, IDs in
array order, frozen `addBatch` queue item; the await-main-then-race-ditto choreography
(introduced `b886d8a`) was deleted in `e6d0b0c`. **DO NOT** re-introduce per-leg
submission or any multi-request write that must succeed atomically — extend `addEntries`.

**F — lock races.** `updateEntry`/`deleteEntry` scanned rows then mutated by index with
NO lock; concurrent queue drains raced. Fix: pure `findRowByEntryId` (`b784f7f`) then
lock→resolve→mutate→release (`2b438ab`). **DO NOT** resolve a row index outside the lock
window; row indices are only valid while the lock is held.

**G — getMaster zeros.** MASTER headers live in non-contiguous columns; reader silently
returned `{onHand:0, budgets:{}}` (#15). Related: per-row `setFormula` for col D was
reverted (`61443db`) — col D is one ARRAYFORMULA in D2; GAS never writes col D (the
skipped column in saga H's `584b8ba`). **DO NOT** make GAS write formulas into
INCOMING/OUTGOING or MASTER. Known weak point: `3_master.ts` hardcodes 7 category names
and silently drops unknown MASTER columns.

**H — blank-row race (newest, fixed 2026-07-10).** The weekly visibility trigger called
`insertRowBefore()` WITHOUT the document lock, landing between an in-flight insert's
row-insert and field-writes → one permanently blank ID-less row, invisible to the
frontend (everything keys off Entry ID). Fix (PR #125): shared `runExclusive` helper
(`c3812cc`), trigger serialized under the same lock (`e8d4ef1`), field writes as atomic
contiguous-column `setValues` runs (`584b8ba`), rule generalized in ADR-0009. **DO NOT**
add any IO-sheet row insert/delete/shift outside `runExclusive`.

## Reverted — DO NOT re-attempt

| Idea | What happened | Settled standard |
|------|---------------|------------------|
| Skeleton loaders / radar-ping sync indicator (#60, PR #85) | Wholesale reverted in #86: `aab0039`, `6275c36`, `7a28e68` (only a divider fix kept) | Shimmer keyframe (`app.css` `@keyframes shimmer`) is THE loading treatment. Do not re-propose skeleton components. |
| Money 0→value roll animation | `f8de720` removed 0-init count-up → `193676e` accidental revert → `8d0c1b0` redo; tween then removed entirely in `aab0039` | Money renders the value directly, no tween (verified: no tween in `frontend/src/components/ui/Money.svelte`). Never animate from 0 on cold load. |
| Auto-advance to latest week WITH entries (`84983a6`, #84) | Reverted `53c8c07` — misread the issue | "Latest week" means the CURRENT CALENDAR week (`selectedWeek = currentWeekKey()`), even if empty. Do not "fix" this default. |
| Accent/layout redesign thrash | `13c410a`, `54e4307`, `bcfc3b0` | Amber accent, cat-dot, card shadows, single column restored. Don't swap the accent color casually. |

## Refactor campaigns (settled — don't re-litigate)

| Campaign | Scope | Landed |
|----------|-------|--------|
| #55 / PR #56 | Store god-module → domain/aggregations/payload modules | 2026-05 |
| #88–#91 | Gateway adapters, offline-mutation lifecycle module, Category knowledge module (frontend, PR #94, coverage→91% `618d928`); validated clasp dispatcher #91 + fixes #92/#93 (PR #96) | 2026-06 |
| #105–#113 (audit of 2026-07-05) | Error taxonomy behind adapter #105, store split #106, AmountField #107, today() #108, wire-contract parity #109, IO repository #110, atomic batch #111, one Mock predicate #112, view-math extraction #113 → PRs #114–#122 | 2026-07 |

All remote branches merged; no abandoned work, no wontfix issues (as of 2026-07-10).
Open issues: #95 (word-based API secrets), #87 (first-day-of-week config).

## When NOT to use this skill

- Diagnosing a live symptom right now → `money-sheet-debugging-playbook` (this skill is
  the history behind its traps, not the triage table).
- Why the design is the way it is / current invariants → `money-sheet-architecture-contract`.
- How to gate/review a change, the non-negotiable rules → `money-sheet-change-control`.
- Proving a fix (parity/atomicity/TZ proofs) → `money-sheet-proof-and-analysis-toolkit`.
- GAS/Sheets platform theory (locks, quotas, formulas) → `sheets-gas-reference`.
- Ongoing GAS-limits work → `money-sheet-gas-limits-campaign`.

## Provenance and maintenance

All facts verified 2026-07-10 against local git history and GitHub Issues/PRs. Re-verify:
- Any SHA: `git log -1 --format="%h %s" <sha>` (must print, not error).
- Newer sagas since this file: `git log --oneline -20` and `gh issue list --state open`.
- Money has no tween: `grep -n "Tween\|tween" frontend/src/components/ui/Money.svelte` (expect no output).
- Current-week default: `grep -n "currentWeekKey" frontend/src/lib/entriesFilter.svelte.ts`.
- Shimmer standard: `grep -n "shimmer" frontend/src/app.css`.
- #123 item 4 still open: `gh issue view 123 --json body --jq .body | grep -n "Not addressed"`.
- Lock rule: `docs/adr/0009-io-sheet-mutations-share-one-lock.md` exists; `grep -rln "runExclusive" clasp/src` (expect `lib/locking.ts` among hits).
- Category-sync scope still single-cell-only: `grep -n "numRows\|numCols" clasp/src/lib/categorySync.ts`.
