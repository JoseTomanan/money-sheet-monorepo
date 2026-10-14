# ADR-0018: Durable Admission Finishes the Interaction

**Status:** Accepted (issue #228)

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
Logical operations capture the Connection lifetime, accepted time, affected IDs,
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

One notification episode starts with outstanding work. `SYNC_NOTICE_DELAY_MS`
is 5,000; the full adapter request budget, `REQUEST_TIMEOUT_MS`, is 15,000,
including response-body consumption and parsing. The soft deadline does not
cancel delivery. Fast work produces no routine toast. Durable unresolved writes,
confirmed writes awaiting reconciliation, read-only work, and failed waiting work
use the issue's distinct delayed copy. Overlaps update one owned toast. Dismissal
or expiry does not reannounce the same episode; static header status retains the
retry path. Actionable errors take priority, and recovery dismisses only its own
notice. Existing hover, focus, visibility, and keyboard behavior remains.

Connection changes, credential rotation, Mock Mode transitions, and teardown
invalidate publication and notification lifetimes. Admission-time add scrolling
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
