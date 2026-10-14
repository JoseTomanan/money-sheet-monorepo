# ADR-0017: Financial State Belongs to a Connection Destination and Lifetime

**Status:** Accepted (issue #222)

## Context

Device-global snapshots and pending writes could follow new Settings credentials to another spreadsheet. Numeric Entry IDs can overlap across spreadsheets, and requests already sent can settle after Settings changes. No stable spreadsheet identity is exposed by the API.

## Decision

The exact saved GAS web app URL is the observable destination identity. Secrets are credentials, excluded from persistence namespaces. Different URLs are different destinations even if they might reach the same spreadsheet; no URL normalization or alias inference is permitted.

`setConnection` notifies one financial lifecycle owner in the store. A changed URL or secret starts a new lifetime: clear active financial state, errors and pending indicators synchronously, hydrate only that destination's recoverable state, and fetch through captured credentials. Saving identical credentials and repeated `init()` calls do not initialize again. One online handler serves the active lifetime.

Every read, mutation and replay captures its destination, adapter and lifetime. Old completions cannot publish state, rollback rows, show notifications, save active snapshots or clear new pending indicators. Switching does not cancel a remotely committed mutation. The queue still settles the already-sent item in its originating scope; ambiguous outcomes retain the original payload and Mutation ID. Replay checks the lifetime before dispatching another item.

Extend #220's queue owner with one owner per URL, preserving its existing durable submission, coalescing and acknowledgment algorithm. Queue and cache keys are `ms_queue:v2:<JSON URL>` and `ms_cache:v2:<JSON URL>`. Different scopes may settle independently, but one scope never has competing delivery owners. Mock Mode uses an ephemeral queue and never reads or writes real snapshots or queues. The canonical Mock Mode predicate remains shared with Connection selection.

## Legacy recovery

A saved Connection cannot establish the origin of the old `ms_queue` or `ms_cache`. Unknown-origin cache is excluded from display. Keep the single legacy queue's original bytes in place as a bounded quarantine, excluded from rendering and automatic delivery. Show a recovery notice and a Settings action that requires explicit confirmation of the original saved URL.

Association requires an empty destination queue, avoiding temporary-ID collisions or guessed ordering with newer work. Persist `ms_queue_legacy_owner` as a recovery journal containing the confirmed URL and original bytes. If interrupted before writing the scoped queue, its first read initializes from that journal. Once the scoped key exists (including an empty queue after replay), the legacy source is never imported again. Keep the original unscoped bytes and journal for recovery; malformed work and storage failures remain observable and are never discarded. Existing Mutation IDs remain unchanged; older missing keys receive the queue's existing durable pre-replay key assignment.

## Consequences and alternatives

- Returning to the exact URL recovers its pending operations across switches and reloads. Secret rotation permits retry using updated credentials without moving ownership.
- Already-sent work may commit remotely; isolation is a publication guarantee, not request cancellation or exactly-once delivery.
- An unavailable new destination renders its own cache or empty/loading state. It cannot borrow the old destination's balances.
- Cross-tab coordination remains outside #220/#222. No account-management UI, identity endpoint or backend/schema change is introduced.
- Discarding old work, assigning it to the saved URL automatically, and redirecting old replay through a per-call adapter were rejected because each guesses or loses ownership.

Validation uses fake HTTP destinations and deferred responses, focused queue/cache/store tests, parity checks, and a dedicated Settings/recovery Playwright flow without live credentials.
