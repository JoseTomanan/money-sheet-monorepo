---
name: money-sheet-diagnostics-and-tooling
description: Measure a money-sheet-monorepo behavior before changing it: GAS cold starts and request latency, DocumentLock contention, frontend/browser performance, or validation timing. Use when a performance claim needs numbers, when timing out or slow behavior is reported, or when designing instrumentation and a reproducible measurement loop.
---

# Diagnostics and tooling

Measure first, change second. Record the command, date/timezone, target environment, sample count, and whether each sample was cold or warm. Never print URLs, API secrets, or connection localStorage.

## Safe measurement loop

1. Define one observable: request duration, error rate, lock wait, render time, or test duration.
2. Capture a baseline under representative conditions. Separate the first request after idle from subsequent requests.
3. Change one plausible cause, then repeat the identical probe.
4. Compare distributions and failures, not a single lucky run. Preserve raw timings as a local artifact or issue note without credentials.

## GAS request latency

The deployed web app redirects, so probes require `curl -L`. Read actions are unauthenticated and are the safest latency probes. Use a shell variable already sourced from an ignored env file; never echo it.

```bash
time curl -sL "$GAS_URL?action=getEntries" -o /dev/null
time curl -sL "$GAS_URL?action=getEntries" -o /dev/null
```

Run a first request after a documented idle interval, then a small warm series. A slow first request alone indicates cold-start behavior; a slow warm series needs a different hypothesis. Do not treat an HTTP failure as a timing sample.

## Lock contention

All INCOMING/OUTGOING row-shifting mutations share the document lock via `runExclusive`. To investigate a lock timeout:

1. Reproduce with concurrent, controlled mutation requests against a disposable spreadsheet or explicitly approved live target.
2. Capture start/end times and response envelopes for every request.
3. Check that every mutating path, including triggers, takes the same lock before proposing a timeout increase.
4. Keep concurrency probes bounded; a load test against the real household ledger needs explicit authorization.

The relevant code is `clasp/src/lib/locking.ts`, `clasp/src/2_entries.ts`, and `clasp/src/5_visibility.ts`.

## Frontend and test timing

- Browser flow: use Playwright traces for a reproducible failing or slow flow; standard E2E is Mock Mode and avoids GAS noise.
- Unit suite: use Vitest's focused-file execution while diagnosing, then run the full package suite to catch coupling.
- Build/typecheck: time the exact package command, since the packages have different TypeScript and Vitest configurations.

## Interpretation guardrails

- State the environment: Mock Mode vs real GAS, local vs deployed, cold vs warm.
- Attribute only what the evidence distinguishes. A client-side 15-second timeout can make a platform delay appear as a connection failure.
- Keep instrumentation out of production paths unless it has a clear owner and removal/retention plan.
- Send a recurring quota/cold-start limitation with a proposed mitigation program to `money-sheet-gas-limits-campaign`.

## When NOT to use this skill

- A functional bug with no measurement question → `money-sheet-debugging-playbook`.
- Writing regression tests or choosing CI gates → `money-sheet-validation-and-qa`.
- GAS runtime semantics and deployment anatomy → `sheets-gas-reference`.

## Provenance

- Client timeout: `frontend/src/lib/adapter-real.ts` (`REQUEST_TIMEOUT_MS`).
- Lock invariant: ADR-0009 and `clasp/src/lib/locking.ts`.
- Redirecting API and live credentials boundary: `money-sheet-run-and-operate` and `money-sheet-build-and-env`.
