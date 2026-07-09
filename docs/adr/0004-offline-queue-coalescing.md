# Offline Queue Uses Coalescing, Not Append-Only

When a mutation fails to reach GAS (network error or timeout), it is queued in localStorage (`ms_queue`) for later replay. We chose a **coalescing** strategy: a later operation on the same logical entry merges into or cancels the earlier queue item rather than appending a new one.

Coalescing rules:
- add A + edit A → single addEntry with the merged fields
- add A + delete A → net zero; both are removed from the queue
- edit #N + edit #N → single updateEntry with the latest patch
- edit #N + delete #N → single deleteEntry(#N)

## Considered Options

**Disallow edits on Local Entries** — while the simplest to implement, it means the user cannot fix a typo in an entry they just added offline. This is frustrating UX for the most common offline scenario (commute, poor signal).

**Append operations and rewrite IDs at sync time** — queue `addEntry` and `updateEntry(-tempId)` as separate items, then rewrite the dependent operation's ID after the add resolves and returns a real Entry ID. Brittle: the rewrite logic must handle every dependency shape, and a crash mid-sync can leave the queue in an inconsistent state.

Coalescing was chosen because it keeps the queue always in a valid, replayable state with no inter-item dependencies, while allowing the user to interact with Local Entries normally.

## Amendment (issue #111): the `addBatch` item is frozen, not coalesced

A Split Entry / Fund Redistribution now submits as one atomic `addEntries` call (see the batch-add ADR) instead of N independent `addEntry` calls. When that single call fails to reach GAS, it queues as one **`addBatch`** item — `{ tempIds: number[], payloads: AddEntryPayload[] }` — rather than N separate `add` items.

`addBatch` is a deliberate, **self-contained** exception to "every queue item is independently replayable": all the data needed to replay the whole batch as one `addEntries` call lives on that single item, so there is still no inter-item dependency — just one item covering N legs instead of N items covering one leg each.

**Freeze rule:** while a batch's legs sit in the queue (unsynced), those legs are **read-only** Local Entries. Editing or deleting an individual leg is blocked with a user-facing message asking the user to sync first, rather than being queued. This keeps the existing four coalescing rules untouched — no new merge rule is introduced for a batch leg, because a batch leg is never allowed to reach `enqueue()` for an edit or delete in the first place. Once the batch drains successfully, its legs become ordinary synced Entries and the freeze no longer applies.
