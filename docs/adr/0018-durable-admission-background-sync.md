# ADR-0018: Durable Admission Finishes the Interaction

**Status:** Accepted (issue #228); presentation revised by issue #236 (2026-10-15)

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

One core refresh runs per lifetime with a trailing dirty request. Entries, MASTER,
and Categories publish atomically. Config and Stats settle independently; only
responses from their valid revision/generation publish. Failed reads retain usable
data and do not schedule an unbounded retry loop. Balances and statistics remain
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
