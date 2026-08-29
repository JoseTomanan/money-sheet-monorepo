# ADR-0013: Idempotent Entry Saves Use a Persisted Mutation ID

**Status:** Accepted

## Context

A browser can time out after GAS has committed an `addEntry` or atomic `addEntries` request. Retrying without a stable operation key creates duplicate rows; rapid Save clicks have the same risk.

## Decision

The browser creates one opaque UUID-like Mutation ID per user-initiated new-entry save. It sends that same key on every delivery attempt and persists it with a queued `add` or `addBatch` item before retrying. A batch shares one key across all legs.

`INCOMING/OUTGOING` stores the key in column I (`MUTATION ID`). New real Entry rows write it; week separators and historical rows retain a blank value. Under the existing document lock, GAS looks up the key before inserting. A matching identical request returns the original Entry or batch; batch responses are ordered by the server-assigned Entry IDs, which preserve request-array order. A reused key with different content is a validation error and writes nothing.

Entry ID remains the server-owned stable identity. The browser must never predict it from a row or max value: only GAS can assign the next ID safely while holding the document lock.

## Consequences

- `addEntry` and `addEntries` are safe to retry after an ambiguous timeout without duplicating rows.
- A queued new add is immutable until it syncs: changing its payload after a possibly committed request would make a retry ambiguous. The UI blocks edit/delete for such Local Entries.
- No historical backfill is needed. Blank Mutation IDs are expected and remain readable/editable.
- Setup writes the column-I header for migrated sheets; it does not modify old rows.
