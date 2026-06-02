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
