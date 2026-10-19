# ADR-0019: Category sync owns decisions and interrupted-work recovery

**Status:** Accepted

## Context

Issue #234 found that Category sync split classification, confirmation, writes,
and pending-work handling across application and infrastructure. Every exception
from the shared transaction was reported as lock refusal, including exceptions
after some Outgoing Tags had already changed. The document lock serializes these
writes; it does not provide rollback.

## Decision

Proceed with the Category sync deepening. The application module
`clasp/src/lib/application/categorySync.ts` owns edit classification, collision
decisions, delete fallback, count/confirm/transaction ordering, and recovery.
`runCategorySync` accepts a semantic edit and a catalog excluding the edited
Subcategory from the other-name set. `retryCategorySync` accepts the one saved
mapping. Both use `applyCategorySync` for confirmation and application. Callers
supply semantic operations rather than implementing the decision sequence.

Infrastructure translates sheet coordinates and merged Category cells, counts
matching Outgoing Entries, retags rows, supplies the shared document transaction,
persists the pending mapping, and renders dialogs. Application contains no sheet
coordinates or GAS dependencies. ADR-0014's dependency roles remain intact.

Outcomes are explicit:

| Outcome | Meaning | Pending record |
|---|---|---|
| `ignored` | Unsupported edit, creation, or unchanged name | Unchanged |
| `blocked` | Rename collision, or deletion with no resolvable parent | Unchanged |
| `empty` | No saved retry | Unchanged |
| `declined` | User declined confirmation | Unchanged |
| `deferred` | Transaction failed before invoking its work callback | Save the original mapping |
| `interrupted` | Transaction failed after invoking work; Tags may have changed | Save the original mapping |
| `applied` | Transaction returned successfully | Retry clears its record; edit leaves any prior record alone |

The transaction adapter must acquire ADR-0009's shared document lock before
invoking work. This callback boundary distinguishes lock refusal from an
interrupted attempt without interpreting exception wording. Failure after callback
entry is conservatively reported as interrupted even if no write landed, or if
all writes landed before lock release failed. Failure outcomes carry the
pre-confirmation affected count, not a claimed count of committed writes.

Both failure paths save the original `{ kind, oldValue, newTag }` in the existing
single `PENDING_CATEGORY_SYNC` property. No completed-row list or general queue is
introduced. Retagging rereads rows inside the lock and only changes non-separator
Outgoing Entries still carrying `oldValue`. Retry confirms the remaining count
and converges by skipping already-retagged rows. A successful confirmed retry with
zero remaining matches also clears its record. Decline and repeated failure retain
the record. A later failed edit replaces the single pending record, as before.

This extends ADR-0010's lock-refusal recovery rule to interrupted work. It does
not promise atomic writes, rollback, or recovery after a hard GAS termination
that prevents the exception handler or property write from running. Retry applies
the saved mapping rather than reinterpreting later Category edits.

## Consequences

Edit and explicit retry share one owner of confirmation and recovery policy.
Dialogs distinguish an attempt that never acquired the lock from one that may
have partially applied. A missing delete parent is blocked instead of writing
blank Tags.

Tests through the application interfaces cover ignored edits, collisions,
decline, lock refusal, interrupted retagging, retry convergence, and stash
clearing. Local integration tests use the real retagger and shared-lock wrapper
with in-memory sheet and lock boundaries; they do not claim live GAS verification.

Opt-in installation, single-cell detection, confirmation, formula-owned Main
Category, and the one-retry limit remain. Multi-cell propagation, layout changes,
automatic rollback, and live deployment are outside this change.
