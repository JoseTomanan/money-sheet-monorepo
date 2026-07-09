# ADR-0008: Atomic `addEntries` Batch Action for Multi-Leg Writes

**Status:** Accepted

## Context

A Split Entry (N legs) and a Fund Redistribution (2 legs) were each submitted as N independent `addEntry` POSTs. Every leg acquired its own document lock and did its own full-column read — an N-leg split cost ~N× the Sheets round-trips it needed. Worse, there was no transaction across legs: if one leg's POST failed mid-split, the already-inserted legs stayed on the sheet as orphans (a half-applied split), and the frontend's own sequencing (awaiting the main leg before racing the ditto legs, purely to keep the `^^`-grouping's main leg on the lowest ID) added client-side complexity to work around a server-side gap.

## Decision

Add a new authenticated `addEntries` action (`{ action: "addEntries", entries: AddEntryPayload[] }` → `{ ok: true, entries: EntryData[] }`) that inserts every leg under **one** document-lock acquisition and **one** sheet read, all-or-nothing.

- **Validate-then-write:** every leg is checked against the identical single-leg rules used by `addEntry` (tag/direction invariant, ISO date, Outgoing-amount-non-negative) *before* the lock is acquired or any row is written. The first invalid leg rejects the whole batch with a validation error; nothing is written. There is no rollback path — validate-then-write makes a write failure mid-batch effectively unreachable short of a Sheets outage, so none was built.
- **IDs are assigned in array order**, leg 0 lowest, as a contiguous block starting after the current max ID — preserving the `^^` convention's "main leg owns the lowest ID in the run" without any client-side await/race choreography.
- **Descriptions are stored verbatim.** The batch action is agnostic to the `^^` ditto marker and the `[REDISTRIBUTE]` convention — those remain frontend-only concepts.
- **Row insertion stays date-ordered** across the whole batch: each leg's insertion point is computed against the sheet state as it stands after the previous legs in the same batch were inserted, so legs interleave correctly with existing dated rows and with each other.
- Split Entry and Fund Redistribution both migrate to this action in the same change — both already funnel their leg arrays through one store entry point (`store.addEntry(array)`), so only the underlying transport changed, not the call sites.

See [ADR-0004's amendment](0004-offline-queue-coalescing.md#amendment-issue-111-the-addbatch-item-is-frozen-not-coalesced) for how a batch that fails to reach GAS is queued and frozen until synced.

## Consequences

- An N-leg split now costs one document-lock acquisition and one sheet read instead of N — the round-trip cost issue #111 flagged is gone.
- Partial-failure orphaning is no longer possible: a batch either writes every leg or writes none. The old "surviving legs persist" integration test (`tests/integration/splitEntry.real.test.ts`) was replaced with tests asserting the atomic contract.
- The frontend's `addLegs` engine path lost its await-main-then-race-ditto sequencing entirely — the server's array-order ID assignment makes it unnecessary.
- Rollback / best-effort partial writes were explicitly rejected as out of scope; a write failure after validation passes is treated as an unrecoverable-but-vanishingly-rare case, not a case worth engineering around.
- `updateEntry`, `deleteEntry`, and editing an existing split are unchanged — this ADR only covers the insert path.
