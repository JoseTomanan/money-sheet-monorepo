# ADR-0018: Durable Admission Finishes the Interaction

**Status:** Accepted (issue #228); presentation revised by issue #236 (2026-10-15) and issue #259 (2026-10-27); metadata publication revised by issue #245 (2026-10-21)

## Context

GAS requests and the subsequent financial reads can take seconds. Keeping a form,
selection, row animation, or dimmed balance attached to that latency prevents
ordinary entry work even when its intent is safely saved on the device. An HTTP
timeout does not establish whether GAS committed the write.

## Decision

The existing Offline Queue owns admission, delivery, acknowledgment, coalescing,
and replay. Its admission result exposes synchronous `accepted` and asynchronous
`completion`. Persistence must succeed before acceptance or any request. Bulk
Delete admits its gesture with one storage write before dispatch. Mock Mode uses
the same owner with ephemeral storage. Forms and selection finish only on
acceptance; admission errors leave the draft or selection available. This is the
submission-interface change required by #228, not completion of #224's broader
interface exploration.

The store owns optimistic presentation and eventual outcomes after forms unmount.
Logical operations capture the Connection lifetime, affected IDs,
and delivery/waiting/reconciliation phase. Same-entry delivery guards and frozen
new saves remain. Confirmation releases the interaction guard independently of
financial reads. Revision guards retain acknowledged changes and tombstones until
a read begun after confirmation can replace them. Later intent supersedes earlier
presentation ownership; an earlier completion cannot release its guards.

One core refresh runs per lifetime with a trailing dirty request. Entries and MASTER
publish atomically under the financial revision guard. Stats settles independently
under its revision/generation guard. Issue #245 revises the original requirement
that Categories publish atomically with every financial snapshot: Categories and
Config now have independent successful-load state and five-minute freshness from
their own response times, scoped to the exact saved Connection URL. Entry mutations
neither invalidate nor extend metadata freshness. Metadata publication requires a
current Connection lifetime, independently of financial revisions. Failed reads
retain usable data and do not schedule an unbounded retry loop. Balances and statistics remain
sheet-sourced. The UI marks stale or unavailable values explicitly, preserving
normal contrast and the established shimmer only for cold loading.

The persisted cache is the accepted server baseline, with backward-compatible
update/statistics metadata. Durable queued intent is overlaid after hydration and
publication. Speculative rows and patches never become the cached baseline. Confirmed write
acknowledgments are separate cache metadata (confirmed rows and delete tombstones),
overlaid on reload until a sufficiently new coherent snapshot replaces them. They
are never replayed as unsent work.
Definitive replay rejection removes only that item and restores its baseline;
ambiguous transport/auth/storage outcomes retain recoverable work.

The queue's `requestDrain` latches through active delivery. Online startup,
reconnection, explicit retry, and successful delivery request replay. New work
cannot bypass an older failed item. Automatic replay stops after a network,
authorization, storage, or definitive failure until reconnect or explicit retry.
Already dispatched unrelated confirmed-entry requests keep their independent
delivery semantics. New saves retain the original payload and Mutation ID.

### Metadata freshness revision (issue #245)

Successful Categories/Config responses persist immediately, even before a financial
snapshot exists or after core/Stats completion. Metadata-only cache writes preserve
the latest financial baseline, acknowledgments, tombstones, and other resource's
freshness. A metadata-only record explicitly lacks financial availability. Defaults
alone are not a successful Config load; a successful empty Categories map is loaded.
Legacy confirmed values remain usable but missing, invalid, non-finite, and future
timestamps require revalidation. Financial saves preserve metadata response times.

Startup and routine reconciliation reuse fresh metadata; existing refresh triggers
revalidate expired resources. There is no polling. Direct edits in Sheets become
visible on the next refresh after expiry, or immediately through the accessible
Refresh action in status details, available even while ready. Refresh bypasses both
metadata ages, joining pending requests. With pending durable writes it latches
that intent through the existing queue owner's reconciliation.

Each metadata resource has at most one pending request per Connection lifetime,
including requests spanning multiple financial cycles. Failure retains confirmed
values and their original timestamps, reports its actual cause in recovery, and
releases the request for retry/reconnect. Previously loaded Categories allow fresh
Entries/MASTER to reconcile despite metadata failure or delay. Without any successful
Categories load the initial snapshot remains unavailable. Pending metadata counts
as busy; failed metadata counts as waiting. Cache hits are not network work.
Connection changes, credential rotation, Mock Mode changes, and disposal invalidate
old requests' publication, cache, and status rights. Same-URL credential rotation can
rehydrate confirmed metadata but cannot join an old lifetime's request. Mock Mode
remains ephemeral and no-Connection state sends no real requests. The wire contract,
financial reads, Stats semantics, and delivery owner are unchanged.

Rejected alternatives include HTTP caching (the adapter deliberately bypasses it),
polling, treating defaults as confirmed metadata, coupling metadata validity to Entry
revisions, and persisting a captured older financial snapshot on late Config success.
Deterministic fake-clock/deferred-adapter tests and intercepted real-adapter browser
counts establish request reduction; no live latency or quota improvement is claimed.

### Presentation revision (issue #236)

The maintainer explicitly replaces the original five-second owned notification
policy and static text header control. Routine saved, syncing, refreshing, loading,
and waiting toasts are no longer produced, regardless of duration. Actionable
validation, authorization, storage, and definitive rejection errors retain their
existing interaction and dismissal behavior; sync transitions never erase them.

One shared control floats in the viewport's upper-left corner (respecting device
safe areas), with a pastel 7px glyph derived from the existing positive/local/destructive
semantic colors and a soft shadow, and opens status/recovery details
by keyboard or touch. Static green requires usable confirmed data and no unresolved
delivery, reconciliation, or failed reads. Blue uses the established shimmer only
on the glyph while work is active, including optional Config and Stats reads.
Offline or failed waiting takes precedence as static red, with the actual reason
in the details. Reduced motion makes blue static. Demo/no-Connection states use an
explicit inactive presentation and never claim confirmation in a real spreadsheet.
Accessible text distinguishes saved-on-device intent from confirmed writes; an
empty queue alone is insufficient to establish readiness. Retry uses the existing
queue owner for unsent work and refreshes reads otherwise. There is no new polling,
connectivity probe, queue, or delivery owner.

This narrow glyph animation is intentionally authorized despite the reverted
skeleton/radar indicator experiments (#60/#85/#86). Usable balances, budgets,
statistics, and rows keep normal contrast and no background-sync animation. Cold
loading, Local Entry markers, frozen guards, and stale/unavailable labels remain.
The adapter request budget, `REQUEST_TIMEOUT_MS`, remains 15,000 including response
consumption and parsing; timeout does not establish server-side cancellation.

Connection changes, credential rotation, Mock Mode transitions, and teardown
invalidate publication and status lifetimes. Admission-time add scrolling
also checks the initiating route and Connection before changing scroll position.

### Status modal revision (issue #259)

Issue #259 explicitly supersedes #236's pastel glyph and nonmodal status-details
presentation. The compact 7px dot, 44px touch target, and safe-area-aware upper-left
placement remain. Saturated green, blue, and red replace the white-mixed tints;
sync-specific light/dark tokens keep the matching modal status heading readable
without changing the global palette. The dot uses Tailwind `shadow-xs` in both themes.

User activation opens a bits-ui Dialog (ADR-0007), with an accessible title, visible
close control, focus containment, Escape dismissal, and focus restoration. The
color-coded status heading appears inside the modal only; the explanation retains
actual errors, locally saved intent, Sheets acknowledgments, and pending reads.
Inactive Demo/no-Connection copy never implies real-sheet confirmation. Long errors
wrap within the viewport. State changes update the open modal without dismissing it
or moving focus; opening/closing sends no requests. Recovery still delegates to
`store.retrySync()` for queued delivery and forced metadata/read refresh.

This revision preserves the preceding sync, notification, Connection, and motion
semantics. Browser evidence covers keyboard/touch, live recovery, original Mutation
IDs, text contrast, reduced motion, and screenshots at 320px, 390px, and desktop in
both themes. It uses intercepted HTTP/Mock Mode without live spreadsheet writes.

## Consequences and alternatives

- An accepted gesture means intent was saved locally, not that sheet balances
  already include it. Acknowledgment and read reconciliation remain distinct.
- Delivery runs while the app is open. Durable intent resumes on reopening;
  closed-tab delivery and cross-tab coordination remain outside this decision.
- Retaining a single completion promise as the form's dismissal gate, adding a
  component-owned queue, computing optimistic balances, and showing immediate
  routine toasts were rejected because each hides or conflates these boundaries.
- This extends ADR-0004 and ADR-0017 while preserving atomic batches (ADR-0008),
  sheet-owned metrics (ADR-0011), and idempotent new saves (ADR-0013).

Validation uses deferred adapters, fake timers, persistence refusal, lifetime
isolation, cache/reload regressions, and intercepted-network browser scenarios.

## Entry submission interface review (issue #224)

The review after #228 and #223 retains the existing interface. `EntryMutation`
already preserves single/batch Add payloads and Edit identity/patches. App's
`handleSave` routes those variants to `submitAddEntry`/`submitUpdateEntry`, each
returning `EntrySubmission`. EntrySheet reads only `accepted` and the optional
admission `error`; it never branches on Promise versus submission return shape or
awaits `completion`. App uses admission only for route/Connection-guarded Add
scrolling. Delete, bulk selection, and Fund Redistribution use the same contract.

The remaining problem was insufficiently documented completion semantics and
coverage split between callback-only component tests and store tests. A resolved
`true` completion includes work retained for replay, not just confirmed writes.
`false` includes refusal, definitive rejection, and an obsolete Connection
lifetime. An immediately owned core reconciliation may delay completion, and
completion does not guarantee optional reads or future replay. The type now
documents those limits beside each field.

The Promise-only `addEntry`, `updateEntry`, `deleteEntry`, and `deleteEntries`
helpers remain useful to tests and browser fixtures that deliberately await the
initial outcome/reconciliation. No production UI caller uses them. They delegate
to the submission methods and add no delivery ownership. Removing them would
change those consumers without reducing knowledge at the interaction boundary.
No new wrapper, submission dispatcher, result union, or delivery owner is needed.

Evidence for retaining the seam:

| Behavior | Evidence |
|---|---|
| Accepted Add/Split/Edit close during unresolved completion; repeated Save is latched | `frontend/src/components/entry/EntrySheet.test.ts`, in-flight save latch tests |
| Real storage refusal surfaces an admission error, retains the draft, permits retry; later definitive failure rolls back after unmount | `frontend/src/components/entry/EntrySheet.submission.test.ts`, Add/Split/Edit refusal and rollback cases |
| Ambiguous delivery retains the admitted payload/key, freezes new saves, and replays through the existing owner | Same integration test file, Add/Split/Edit ambiguous delivery cases |
| App wiring dismisses Add/Split once, before delivery; later confirmation, rejection, or queuing never reopens it | `frontend/e2e/optimistic.spec.ts`, Add/Split admission matrix; existing Edit outcome matrix |
| Confirmation releases guards before required reads; optional reads do not gate core completion | `frontend/src/lib/backgroundSync.test.ts` and `frontend/e2e/background-sync.spec.ts` |
| Amount policies, atomic batching, Mutation IDs, frozen saves, and Connection lifetime isolation | Existing `amountField`, `entryForm.svelte`, `queue`, `optimisticEntries`, `connectionLifetime`, and parity test suites |

These are local component/store and Mock Mode browser checks. They do not claim
live Sheets validation or authorize live writes.
