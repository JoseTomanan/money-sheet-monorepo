# ADR-0009: Every INCOMING/OUTGOING Mutation Shares One Document Lock

**Status:** Accepted

## Context

Occasionally a completely blank row (no date, tag, description, or Entry ID)
appeared in the `INCOMING/OUTGOING` sheet. It was invisible to the frontend
because everything there keys off Entry ID (col H), and a blank col H reads as
a week-separator row, not an Entry.

`addEntry`, `addEntries`, `updateEntry`, and `deleteEntry` (`clasp/src/2_entries.ts`)
each acquired `LockService.getDocumentLock()` before mutating the sheet. But
the weekly separator/visibility trigger —
`applyRowVisibilityForActiveSheet` → `applyRowVisibility` →
`_insertMissingSeparators` → `insertSeparatorIfMissing`
(`clasp/src/5_visibility.ts`), reachable from both the Sunday-1am Manila-time
trigger and the "Run autohide now" menu item — called `sh.insertRowBefore()`
directly, without ever acquiring that lock.

`LockService` only serializes callers that themselves call `.waitLock()`; it
does nothing to block an unrelated `insertRowBefore()` call. `insertEntry`
(`clasp/src/lib/repository.ts`) computes a target row from a `readRows()`
snapshot, then calls `insertRowBefore(targetRow)` and `writeEntryFields(...)`
as separate steps. If the trigger's own `insertRowBefore` landed on the real
sheet in the gap between those two calls, every row below shifted down by
one — the in-flight request kept writing to its now-stale `targetRow`
(landing on the trigger's newly-inserted row instead), leaving the row the
request itself inserted completely empty, forever.

This was reproduced with a throwaway in-memory harness reusing the real
`insertEntry` against a sheet stand-in, interleaving a simulated concurrent
insert at that exact gap.

## Decision

Extract a small, unit-testable lock helper —
`runExclusive(lock, timeoutMs, fn)` in `clasp/src/lib/locking.ts` — that wraps
GAS's `Lock.waitLock`/`releaseLock` in a `try/finally`. **Every** function that
mutates the `INCOMING/OUTGOING` sheet, not just the four entry-CRUD actions,
now runs its body through `runExclusive` against the same
`LockService.getDocumentLock()`:

- `addEntry`, `addEntries`, `updateEntry`, `deleteEntry` (`clasp/src/2_entries.ts`,
  unchanged in behavior, refactored onto the shared helper)
- `applyRowVisibilityForActiveSheet` (`clasp/src/5_visibility.ts`) — the fix.
  Both the weekly trigger and the "Run autohide now" menu item funnel through
  this one entry point, so wrapping it here covers both call sites.

This generalizes ADR-0008's single-lock-acquisition rule (previously scoped to
`addEntries`' N-leg batch) to the whole sheet: **any** code path that inserts,
deletes, or shifts rows in `INCOMING/OUTGOING` must hold the document lock for
its full read-modify-write sequence. There is no reentrancy risk today — no
entry mutation calls into the visibility/separator code, so the lock is never
acquired twice on the same call stack.

As a related hardening (the row-shift race was confirmed as the primary cause,
but a second, independent failure mode was still worth closing in the same
pass): `writeEntryFields`'s live adapter (`clasp/src/1_sheets.ts`) used to issue
up to six separate `setValue()` calls per row. A transient Sheets API error
partway through could leave a row with some fields written and others not. A
new pure `planFieldWrites` (`clasp/src/lib/repository.ts`) groups whichever
`EntryFields` keys are present into maximal consecutive-column runs — skipping
col D (MAIN_CAT), which is ARRAYFORMULA-driven and never written — and the
adapter issues one `setValues()` per run instead of one `setValue()` per
field.

## Consequences

- The separator/visibility trigger can no longer shift a row out from under an
  in-flight `addEntry`/`addEntries`/`updateEntry`/`deleteEntry`, closing the
  blank-row race.
- `runExclusive` is a small, pure, unit-tested seam
  (`clasp/src/lib/locking.test.ts`) — the first local test coverage for lock
  behavior itself. The lock-holding call sites (`2_entries.ts`,
  `5_visibility.ts`) remain GAS-only and untestable locally, per
  `clasp/CLAUDE.md`; the race itself can only be verified against a live
  deployment.
- Any future code path that mutates `INCOMING/OUTGOING` (rows inserted,
  deleted, or shifted) must route through `runExclusive` with the document
  lock — this is now a repo-wide invariant, not a per-action convention.
  `clasp/CLAUDE.md`'s "Key invariants" section is updated accordingly.
- `writeEntryFields` writes are now grouped by contiguous column run, reducing
  Sheets API calls per write and narrowing (though not eliminating — see
  ADR-0008's rollback discussion) the window for a partially-written row from
  a mid-sequence failure.
