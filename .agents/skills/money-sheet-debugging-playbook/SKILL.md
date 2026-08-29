---
name: money-sheet-debugging-playbook
description: Symptom-to-triage runbook for money-sheet-monorepo failure modes. Use when debugging any misbehavior — "entries vanish near midnight", "budgets are all zeros", "ON HAND is 0", "Save button disabled", "can't edit an entry", "unauthorized" errors, "app hangs on load", "request timed out", "lock timeout", "half a split saved", "duplicate mutations", "mutations lost", "typed 100-50 got 10050", e2e specs failing after a UI change, or GAS API errors. Covers bisecting frontend-vs-backend (curl the GAS web app vs Mock Mode), reading the error envelope (code vs legacy error field), inspecting localStorage keys ms_queue/ms_cache/ms_connection/ms_mock_dismissed, and traps: two week-start algorithms (weekStartSunday vs weekStartOfStr), Set-reassignment reactivity in store.svelte.ts, per-call adapter selection in api.ts, text/plain POSTs producing no OPTIONS preflight in devtools.
---

# Money-Sheet Debugging Playbook

Symptom-first triage for this repo (GAS backend in `clasp/`, Svelte 5 SPA in `frontend/`).
All paths repo-relative; run commands from the stated directory. Facts verified as of 2026-07-10.

## Step 0 — Bisect frontend vs backend

1. **Curl the GAS web app directly** (skips the entire frontend). Real URL/secret live in
   gitignored `frontend/.env` and `tests/.env` — never commit or print them.
   ```bash
   # Reads: GET with ?action= (no auth). -L is mandatory: GAS 302-redirects.
   curl -sL "$GAS_URL?action=getMaster"
   # Writes: POST JSON as text/plain (this avoids a CORS preflight)
   curl -sL -X POST -H "Content-Type: text/plain" \
     -d '{"action":"validate","secret":"'"$API_SECRET"'"}' "$GAS_URL"
   ```
   Backend healthy but app broken → frontend bug. Curl broken → backend/sheet bug.
2. **Run the frontend in Mock Mode** (no network at all): `cd frontend && VITE_MOCK=true npm run dev -- --port 1111`.
   Bug reproduces in mock → pure frontend logic. Only in real mode → adapter/network/backend.

## Symptom table

| Symptom | Likely cause | Discriminating experiment | Fix territory |
|---|---|---|---|
| Entries vanish / appear in wrong week near midnight | UTC-vs-local date drift (saga #93→#108) | `cd frontend && npx vitest run src/lib/format.test.ts src/lib/groupEntries.test.ts`; grep for `toISOString` in date paths — there must be none | `format.ts today()` (local wall-clock), `groupEntries.ts weekStartOf` |
| Budgets / ON HAND all zeros | `getMaster` header scan misses columns, or Category not in hardcoded allow-list `clasp/src/3_master.ts:19` (issue #15) | `curl -sL "$GAS_URL?action=getMaster"` — empty `budgets:{}` with a populated MASTER sheet confirms; check MASTER row 2 headers are contiguous and uppercase-match the list | `clasp/src/3_master.ts` (known weak point: 7-category hardcode silently drops unknown columns) |
| Save disabled / entry can't be edited after a Categories sheet edit | Orphaned Tag — Tag no longer in Categories mapping (issue #123, PR #124) | `curl -sL "$GAS_URL?action=getCategories"` and check the entry's Tag exists as Subcategory or bare Category; two independent validators block: `frontend/src/lib/entryForm.svelte.ts saveDisabled` + `clasp/src/lib/dispatch.ts checkTagDirection` | Restore the Categories row, or retag the entry. OPEN: MASTER VLOOKUP `#N/A` on orphaned Tag is explicitly unfixed |
| e2e specs fail right after a UI change | Selector drift (saga: PR #102 deleted `.split-toggle-btn`, broke 7 specs) | `cd frontend && npm run test:e2e` — read the failing locator, then grep the class/testid in `src/components/` | Update selectors in `frontend/e2e/*.spec.ts`; treat e2e as part of the UI change |
| Half a split saved | Should be impossible since ADR-0008 (atomic `addEntries`, one lock, validate-then-write) | Inspect `localStorage.ms_queue` for a stuck `addBatch` item; confirm the write went through `addEntries` not N× `addEntry` | If truly partial, this violates ADR-0008 — escalate; see `money-sheet-failure-archaeology` saga E |
| App hangs on load, then "Request timed out." | GAS cold start exceeding the 15s client timeout (`REQUEST_TIMEOUT_MS` in `adapter-real.ts:48`) | Time it: `time curl -sL "$GAS_URL?action=getEntries" -o /dev/null`; retry — warm runs are much faster | Platform behavior, not a bug per se — see `money-sheet-gas-limits-campaign` |
| "unauthorized" | Secret mismatch, or client reading the legacy `error` field wrong | Curl `{"action":"validate","secret":...}` (above). Read `code` field: `code:"auth"` ⇒ real secret mismatch. Secret is GAS Script Property `API_SECRET` | Reconcile secret in Script Properties vs `frontend/.env` / Settings Connection |
| Mutations lost or duplicated offline | Queue coalescing rules or frozen `addBatch` (ADR-0004) | Inspect `localStorage.ms_queue`; check rules in `frontend/src/lib/queue.ts` (edit+add→merged add; edit+edit→merged patch; delete+add→both dropped; addBatch legs frozen until synced) | `queue.ts`, `offlineMutation.ts`, `mutationEngine.ts` |
| Typed `100-50`, got `10050` | Amount-input sanitise/evaluate asymmetry (saga #101/#104, fix 89284ae) | `cd frontend && npx vitest run src/lib/formula.test.ts`; note `sanitizeAmountInput` keeps `+-*/()` but `evaluateFormula` accepts ONLY a `+`/`-` chain and `SUM(...)` — `*` `/` fail on blur by design | `frontend/src/lib/formula.ts` (`resolveAmountOnBlur`) |
| Lock timeout on writes | DocumentLock contention — every mutation takes `waitLock(10_000)` (`clasp/src/2_entries.ts`) | Reproduce with concurrent writes; see saga #92 (update/delete once had NO lock) | `2_entries.ts runExclusive`; measurement recipes in `money-sheet-diagnostics-and-tooling` |

## Reading the error envelope

POST failures return `{ok:false, error, code, message}` (`clasp/src/lib/dispatch.ts:91,123-126`):
- **`code`** ∈ `auth | validation | not_found | internal` — the structured field; branch on this.
- **`message`** — human-readable detail.
- **`error`** — legacy: the sentinel `"unauthorized"` when `code:"auth"`, otherwise mirrors `message`. Do not string-match it in new code.
- Unknown action → `code:"internal"` and this check runs BEFORE the auth gate (~dispatch.ts:341), so a typo'd action never reports `auth`.

## localStorage keys to inspect (browser devtools → Application)

| Key | Holds | Debug move |
|---|---|---|
| `ms_queue` | Offline Queue items (`add`/`addBatch`/`edit`/`delete`) | Stuck mutations live here; clearing it DISCARDS unsent writes |
| `ms_cache` | Cache-first snapshot of entries/master/categories/config | Stale UI after backend change → clear and reload |
| `ms_connection` | Connection (GAS URL + secret) | Missing → `ConnectionMissingError`; contains the secret — don't paste into logs |
| `ms_mock_dismissed` | Mock Dismissal flag | Predicate: `envMock \|\| (no Connection && !ms_mock_dismissed)` (`connection.svelte.ts:33-37`). "Why is it in Mock Mode?" starts here |

## Traps

- **Two week-start algorithms — do not conflate.** `weekStartSunday(d, tz)` (`clasp/src/lib/weeks.ts:43`) is instant-based, Asia/Manila, drives sheet autohide. `weekStartOfStr(dateStr)` (`weeks.ts:12`) is pure YYYY-MM-DD arithmetic, parity-tested against frontend `weekStartOf` (`groupEntries.ts:10`). "Fixing" one with the other reintroduces TZ drift.
- **Set reactivity needs reassignment.** In `frontend/src/lib/store.svelte.ts:31-35`, `$state` Sets are rebuilt (`pendingIds = new Set([...])`), never `.add()`-mutated. In-place mutation silently kills reactivity.
- **Adapter is selected per call, not at import.** `api.ts:24-25`: `adapter() = _override ?? (mockMode.current ? mock : real)`. Capturing an adapter reference at module load breaks mock/real switching and tests.
- **No OPTIONS preflight in devtools.** POSTs are `Content-Type: text/plain` precisely to avoid CORS preflight against GAS. An absent OPTIONS request is normal, not a clue.
- **GAS URLs redirect.** Curl without `-L` returns an HTML 302 page, not JSON — a classic false "backend is broken".

## When NOT to use this skill

- Root-cause history, dead ends, and revert stories → `money-sheet-failure-archaeology`.
- Building latency/lock/coverage measurements → `money-sheet-diagnostics-and-tooling`.
- Which test suite proves what, adding tests → `money-sheet-validation-and-qa`.
- Starting the app / deploying / spreadsheet ops → `money-sheet-run-and-operate`.
- GAS runtime theory (locks, quotas, clasp, CORS trick in depth) → `sheets-gas-reference`.
- Config keys / env vars / Script Properties inventory → `money-sheet-config-and-flags`.
- Systematic campaign against GAS platform limits → `money-sheet-gas-limits-campaign`.

Deeper per-symptom detail and full curl recipes: see [REFERENCE.md](REFERENCE.md).

## Provenance and maintenance

Verified against the repo on 2026-07-10. Re-verify with (from repo root):
- Actions/envelope: `grep -n "READ_ACTIONS\|AUTH_ACTIONS\|code: ErrorCode" clasp/src/lib/dispatch.ts`
- Category hardcode: `grep -n "HOUSING" clasp/src/3_master.ts`
- Lock timeout: `grep -n "10_000" clasp/src/2_entries.ts`
- Client timeout: `grep -n "REQUEST_TIMEOUT_MS" frontend/src/lib/adapter-real.ts`
- localStorage keys: `grep -rn "ms_queue\|ms_cache\|ms_connection\|ms_mock_dismissed" frontend/src/lib --include="*.ts" | grep -v test`
- Week-start pair: `grep -n "weekStartOfStr\|weekStartSunday" clasp/src/lib/weeks.ts`
- Mock predicate: `grep -n "envMock" frontend/src/lib/connection.svelte.ts`
