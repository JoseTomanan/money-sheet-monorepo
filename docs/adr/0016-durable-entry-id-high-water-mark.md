# ADR-0016: Persist a per-spreadsheet Entry-ID high-water mark

**Status:** Accepted

## Context

Entry IDs are stable identities and must never be reused. Both insert paths
previously calculated the next ID as the greatest ID still present in
`INCOMING/OUTGOING` plus one. Deleting the current maximum therefore erased the
allocator's only memory, and the next insert reused the deleted ID (issue #186).

The allocator must also preserve `addEntries` ordering, idempotent retries,
concurrent writes, legacy spreadsheets, and copied-template isolation without
making formula-owned sheets or columns carry application state.

## Decision

Persist two Script Properties:

- `ENTRY_ID_HIGH_WATER`: the greatest Entry ID ever reserved for this spreadsheet
- `ENTRY_ID_SPREADSHEET_ID`: the spreadsheet identity to which that mark belongs

Every single or batch insert reserves its IDs while holding the same document lock
that protects all `INCOMING/OUTGOING` mutations (ADR-0009). A reservation advances
the high-water mark before row writes. A failed write can therefore leave a gap,
but no later write can reuse an assigned ID. `addEntries` makes one reservation for
the full batch and assigns that contiguous block in request-array order.

On the first insert after migration, an existing spreadsheet seeds the mark from
the greatest Entry ID still present. If the stored mark is lower than a present ID,
the sheet value repairs it. A copied spreadsheet whose inherited identity names a
different source ignores the inherited mark, seeds from the copied rows, and binds
new allocator state to its own identity.

Idempotent Mutation-ID lookup happens before insertion, so a successful request
retry returns the original Entry or batch without reserving another block.

## Consequences

- Deleting the highest Entry, or every Entry, cannot make a later insert reuse an
  ID once the durable allocator has been initialized.
- Concurrent requests remain serialized by the shared document lock; Script
  Properties are not treated as an independent locking mechanism.
- Existing spreadsheets require no eager migration or sheet-layout change.
- IDs deleted before a legacy spreadsheet's first post-migration insert cannot be
  reconstructed. Initialization uses the greatest ID that still exists; the
  never-reuse guarantee is durable from that initialization onward.
- Failed writes may create gaps. Entry IDs promise uniqueness and non-reuse, not a
  gap-free sequence.
- Mock Mode mirrors the contract with a session-local in-memory high-water mark.

## Considered options

- **Continue deriving from rows:** rejected because deletion destroys allocator
  history and reproduces #186.
- **Store the mark in `INCOMING/OUTGOING`, MASTER, or STATS:** rejected because it
  would change sheet layout or place application state in formula-owned surfaces.
- **Use only a process-local counter:** rejected because GAS executions are
  isolated and retries or cold starts would lose the value.
- **Rely on Script Properties without the document lock:** rejected because two
  concurrent read-modify-write reservations could return the same block.
