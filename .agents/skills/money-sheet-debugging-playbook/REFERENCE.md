# Debugging Playbook — Reference

Deeper detail behind the SKILL.md symptom table. Verified 2026-07-10.

## Full curl recipes against the GAS web app

Credentials: real `GAS_URL` / `API_SECRET` values live only in gitignored files
(`frontend/.env` as `VITE_GAS_URL`/`VITE_API_SECRET`, `tests/.env` as `GAS_URL`/`API_SECRET`).
Export them into your shell; never commit or echo them into transcripts.

```bash
# All reads (no secret; READ_ACTIONS in clasp/src/lib/dispatch.ts:318)
curl -sL "$GAS_URL?action=getEntries"
curl -sL "$GAS_URL?action=getMaster"
curl -sL "$GAS_URL?action=getCategories"
curl -sL "$GAS_URL?action=getConfig"

# Auth probe — cheapest write-path check (AUTH_ACTIONS in dispatch.ts:322)
curl -sL -X POST -H "Content-Type: text/plain" \
  -d '{"action":"validate","secret":"'"$API_SECRET"'"}' "$GAS_URL"

# Mutation smoke test (WRITES A REAL ROW — delete it after via deleteEntry)
curl -sL -X POST -H "Content-Type: text/plain" -d '{
  "action":"addEntry","secret":"'"$API_SECRET"'",
  "payload":{"date":"2026-07-10","tag":"MISC","description":"DEBUG-PROBE","direction":"O","amount":1}
}' "$GAS_URL"
curl -sL -X POST -H "Content-Type: text/plain" \
  -d '{"action":"deleteEntry","secret":"'"$API_SECRET"'","id":<ID_FROM_ABOVE>}' "$GAS_URL"
```

Notes:
- `-L` is mandatory: GAS 302-redirects to `script.googleusercontent.com`.
- The integration client (`tests/src/client.ts`) POSTs even reads as text/plain; both GET-with-query and POST forms work for reads.
- CLAUDE.md still lists a `getSubcategoryBreakdown` action — **stale**; it was removed (issue #76) and is not in `READ_ACTIONS`.

## Symptom deep-dives

### Date/UTC drift (entries vanish near midnight)
Historic root cause: "today" was computed four different ways, three via `toISOString()`
(UTC), so between local midnight and UTC midnight entries landed in the wrong day/week.
Durable fix: single `today()` in `frontend/src/lib/format.ts:54` using local
`getFullYear/getMonth/getDate` — never UTC. Discriminators:
- `grep -rn "toISOString" frontend/src/lib frontend/src/components` on any date path is a red flag.
- TZ-dependence proof recipe (run the suite under multiple TZ values) lives in
  `money-sheet-proof-and-analysis-toolkit`.

### getMaster all-zeros (issue #15)
`clasp/src/3_master.ts` reads MASTER row 2 as headers and row 3 as the single formula
row (never `getLastRow()` for data). Two distinct failure modes:
1. Header text mismatch / non-contiguous columns → column skipped silently.
2. The Category isn't in the hardcoded allow-list at `3_master.ts:19`
   (`HOUSING, FOOD, TRANSIT, HEALTH, FINANCE, LIFESTYLE, MISC`) → budget silently
   dropped. Adding a new Category REQUIRES touching this list (known weak point).
Related: `61443db` reverted per-row `setFormula` in favor of a single ARRAYFORMULA in
INCOMING/OUTGOING col D2; a live store-sync test asserts `mainCategory` is non-empty.

### Orphaned Tag (issue #123)
Deleting a Categories sheet row while entries still carry that Tag:
- Edits blocked by BOTH `frontend/src/lib/entryForm.svelte.ts` (`saveDisabled`) and
  `clasp/src/lib/dispatch.ts` (`checkTagDirection`, lines ~165/218/307) — fixing only
  one side is not enough.
- Tag rules: Incoming → Category only; Outgoing → Subcategory OR bare Category
  (bare-Category allowance added in the #123 fix chain f6f22fd→7d46f0c).
- Still OPEN: MASTER's VLOOKUP shows `#N/A` for the orphaned Tag's Main Category.

### Split entries and atomicity (ADR-0008)
`addEntries` is atomic on the backend: one DocumentLock for the whole batch,
validate-then-write, first invalid payload rejects the entire batch, ids assigned in
array order. Frontend side: a queued split is one `addBatch` item in `ms_queue`; its
legs are FROZEN — per-leg edit/delete before sync shows
`BATCH_FROZEN_MESSAGE` ("This entry is part of a split that hasn't synced yet…",
`frontend/src/lib/mutationEngine.ts:44`). A genuinely half-saved split therefore means
either the write bypassed `addEntries` or an ADR-0008 invariant broke — escalate.

### Offline queue semantics (ADR-0004)
Coalescing in `frontend/src/lib/queue.ts` (key `ms_queue`):
| Incoming op | Existing queued op on same id | Result |
|---|---|---|
| edit | add / addBatch (temp id) | merged into the add payload |
| edit | edit | merged patch |
| delete | add | both dropped (net no-op) |
| delete | edit or delete | single delete |

Drain: FIFO, stops at first error; triggered by the window `online` event
(`store.svelte.ts:154`) or manual sync. Optimistic temp ids are strictly decreasing
negatives; `compareEntriesForDisplay` sorts negative ids to the bottom.

### Amount input (10050-instead-of-50 class)
`frontend/src/lib/formula.ts`:
- `sanitizeAmountInput` (line 44): unless the string starts with `=`, strips everything
  except `0-9 . + - * / ( )` — so `*`, `/`, parens survive TYPING.
- `evaluateFormula` (line 76): accepts ONLY `SUM(...)` with literal numeric args plus a
  `+`/`-` number chain. `*` and `/` therefore fail on BLUR with "Invalid formula".
  This asymmetry is intentional; do not "fix" it by widening the evaluator without an issue.
- Positivity enforced at resolve time ("Amount must be positive").
- Regression story: PR #102 accidentally dropped bare-arithmetic typing so `100-50`
  became `10050`; restored by 89284ae; helpers consolidated in b6a5efc + 48cab90.

### Locks (issue #92)
Every mutation in `clasp/src/2_entries.ts` runs under
`runExclusive(LockService.getDocumentLock(), 10_000, ...)` with release in `finally`;
reads take no lock. Historic bug: updateEntry/deleteEntry scanned then mutated by row
index with NO lock → row-shift races during queue drains (fixed b784f7f + 2b438ab:
lock → resolve row by Entry ID → mutate → release).

### Cold start / timeout
Client timeout is 15s (`REQUEST_TIMEOUT_MS`, `adapter-real.ts:48`) surfacing as
`ConnectionError("Request timed out.")` — which is queueable, so writes fall into
`ms_queue` rather than failing loudly. GAS cold starts can approach or exceed this.
Measure before concluding anything (probes in `money-sheet-diagnostics-and-tooling`);
the systematic mitigation effort is `money-sheet-gas-limits-campaign`.

### Mock Mode decision tree ("why am I seeing fake data?")
`mockMode.current` (`connection.svelte.ts:33-37`) is true iff
`VITE_MOCK === "true"` OR (no Connection AND no `ms_mock_dismissed` flag).
- e2e runs always set `VITE_MOCK=true` (`playwright.config.ts`).
- Dev auto-connect: in dev (non-Vitest), `VITE_GAS_URL` + `VITE_API_SECRET` synthesize
  a Connection automatically — so a dev server may be REAL even though you never
  configured Settings.
- `refreshAll` uses `Promise.allSettled`: one failed GET doesn't discard the other
  three, so partially-stale screens are possible; check each fetch, not just one.

## Error taxonomy (frontend)
Defined in `frontend/src/lib/adapter-real.ts`, re-exported via `api.ts`:
`ConnectionError` ⊃ `ConnectionMissingError`; `UnauthorizedError`. Outside the adapter,
use only the predicates `isQueueable` / `isAuthError` / `userMessage` — never
`instanceof` on adapter classes.

## Provenance and maintenance

- Coalescing rules: `sed -n 30,90p frontend/src/lib/queue.ts`
- Frozen-batch message: `grep -n "BATCH_FROZEN_MESSAGE" frontend/src/lib/mutationEngine.ts`
- Formula asymmetry: `grep -n "sanitizeAmountInput\|evaluateFormula" frontend/src/lib/formula.ts`
- Mock predicate + dev auto-connect: `grep -n "envMock\|VITE_GAS_URL" frontend/src/lib/connection.svelte.ts`
- Master allow-list: `sed -n 15,25p clasp/src/3_master.ts`
- Saga SHAs: `git log --oneline | grep -E "89284ae|2b438ab|f6f22fd|9494859"`
- Issues cited (#15, #92, #93, #101–#108, #123, #76): `gh issue view <n>`
