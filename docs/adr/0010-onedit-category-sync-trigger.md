# ADR-0010: onEdit Trigger Syncs Subcategory Rename/Delete into INCOMING/OUTGOING

**Status:** Accepted

## Context

Subcategories are defined only in the Categories sheet (col B = Subcategory,
col C = merged parent Category). Users add, rename, or delete rows there by
hand — no GAS code is involved, and nothing validates or propagates the edit.

Per #123, an Outgoing entry whose Tag no longer matches any known Subcategory
becomes an "orphaned" tag: several client- and server-side checks re-validate
an entry's Tag against the *current* Categories sheet on every edit, so an
orphaned entry became permanently un-editable until manually retagged. #123
fixed the dead end by making a bare Category tag (e.g. `"FOOD"`) permanently
valid on Outgoing, giving a human a recovery path — one entry at a time.

That still leaves every *existing* entry silently orphaned the moment a
Subcategory is renamed or deleted in the sheet, with no bulk path back. This
ADR adds that path: an installable `onEdit` trigger on the Categories sheet
that detects a single-cell rename or delete of col B and bulk-rewrites the
matching Outgoing Tags in INCOMING/OUTGOING, reusing #123's bare-Category
mechanism for deletes rather than inventing an "Uncategorized" bucket.

## Decision

**Pure logic / GAS-glue split**, matching the rest of the codebase
(`lib/setup.ts`+`7_setup.ts`, `lib/repository.ts`+`1_sheets.ts`): all decision
logic lives in `clasp/src/lib/categorySync.ts` (unit-tested), taking every
GAS collaborator (repository, `Ui`, lock, Script Properties) as an injected
dependency. The GAS-facing binding — `onEditCategorySync`,
`installCategorySyncTrigger`, `retryLastCategorySync` — lives in
`clasp/src/6_category_sync.ts` and is not locally testable.

**Detection is single-cell-edit only.** `classifyCategoryEdit` only classifies
a `numRows === 1 && numCols === 1` edit to col B, at or below row 2, using
`e.oldValue`/`e.value`. GAS's `onEdit` event does not supply `oldValue`/`value`
for multi-cell edits (paste, fill-down) or structural edits (row delete) — those
are documented as unsupported, not silently mishandled, per the issue's scope.
Reparenting a Subcategory (editing col C) is a deliberate no-op: col D's
VLOOKUP already re-resolves automatically.

**Confirm-then-propagate, sharing the one document lock.** Before mutating
anything, `runCategorySync` counts affected Outgoing rows
(`countMatchingOutgoingTags`) and shows a `ui.alert` Yes/No confirmation. On
Yes, `retagOutgoingRows` runs under `runExclusive(LockService.getDocumentLock(),
10_000, …)` — the same lock every other INCOMING/OUTGOING mutation holds
(ADR-0009). A rename bulk-rewrites Tag from the old string to the new one; a
delete rewrites Tag to the bare parent Category, resolved from the Categories
sheet's own merged-cell walk (`parentCategoryForRow`) at the time of the edit —
the #123 mechanism, not a new bucket.

**Name-collision guard on rename only.** `findNameCollision` checks the new
name against every other Subcategory (any Category) and the 7 top-level
Category names before any confirmation dialog — a collision aborts with an
error alert and no propagation. Delete has no collision case: the target
parent Category always exists structurally.

**Lock-acquisition failure stashes, not partially applies.** If
`runExclusive` can't acquire the lock in time, the pending propagation (kind,
old value, resolved new tag) is JSON-encoded (`encodePendingSync`) into a
single Script Property (`PENDING_CATEGORY_SYNC`) rather than left half-applied.
A new "Retry last category sync" menu item re-runs the identical
confirm→lock→bulk-write flow (`retryCategorySync`) against exactly that one
stashed value — not a general re-diff of the Categories sheet.

**Opt-in installation, new menu.** `installCategorySyncTrigger` mirrors
`installWeeklyVisibilityTrigger`'s idempotent pattern (delete any trigger
already bound to the handler, then create fresh) and is exposed via a new
`ui.createMenu("Categories")` menu, not folded into "Autohide" and not added
to `runSetup()` — existing spreadsheets are unaffected until a user installs
it once.

## Consequences

- Renaming or blanking a Subcategory in the Categories sheet now has a bulk
  recovery path for existing entries, closing the gap #123 left open for
  everything already saved before the edit.
- The onEdit handler is deliberately narrow: whole-row deletes, multi-cell
  paste, and edits outside col B fire no propagation at all (`e.oldValue` is
  unavailable for these in GAS). `CONTEXT.md`'s Categories-sheet section
  documents this as an accepted limitation, not a bug.
- This is the first installable `onEdit` trigger in the codebase (the only
  prior installable trigger, `installWeeklyVisibilityTrigger`, is time-based).
  It is bound as `onEditCategorySync`, not the reserved simple-trigger name
  `onEdit`, specifically so it retains `LockService`/`PropertiesService`
  access — a simple trigger cannot use either.
- `lib/categorySync.ts` is fully unit-tested (classification, collision
  guard, count/retag, pending-sync encode/decode, and both orchestrators via
  injected fakes for `Ui`/lock/repository). The GAS binding in
  `6_category_sync.ts` — the actual `onEdit` wiring, `ui.alert` rendering
  during a live edit session, and trigger installation — is untestable
  locally and must be verified against a real deployment.
- Top-level Category rename/delete (the 7 hardcoded buckets in `3_master.ts`)
  remains out of scope — a materially heavier change to a still-hardcoded
  list, tracked separately if ever wanted.
