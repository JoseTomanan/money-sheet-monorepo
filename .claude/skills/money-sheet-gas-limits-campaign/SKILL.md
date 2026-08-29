---
name: money-sheet-gas-limits-campaign
description: Plan or execute a sustained mitigation of Google Apps Script platform limits in money-sheet-monorepo, including cold starts, request timeouts, quota pressure, and lock contention. Use when an isolated measurement reveals a recurring platform constraint and a one-off code tweak is insufficient.
---

# GAS limits campaign

Treat a platform-limit problem as a campaign: establish the bottleneck, set a measurable target, make one bounded intervention at a time, and retain proof that normal financial mutations remain correct.

## Start with a campaign brief

Open or update an issue before implementation. Record:

- the observable failure and affected operation;
- baseline samples split by cold/warm and success/failure;
- expected user impact and the current safety boundary;
- a target such as lower timeout rate, bounded lock wait, or fewer API calls;
- rollback condition and the required regression evidence.

Use `money-sheet-diagnostics-and-tooling` for the measurements and `money-sheet-change-control` for the issue/ADR boundary.

## Choose the smallest correct lever

| Constraint | First levers to evaluate | Correctness guard |
|---|---|---|
| Cold starts | clearer retry/timeout UX, bounded retry where idempotence is known, reduce unnecessary startup work | never replay a non-idempotent mutation blindly |
| Slow reads | reduce sheet calls, batch reads, read formula-driven summaries from their designated sheets | GAS never writes MASTER/STATS derived values |
| Lock contention | shorten work while holding the shared lock, avoid unrelated row shifts, measure trigger overlap | every INCOMING/OUTGOING row shift stays under the same DocumentLock |
| Quota pressure | remove redundant calls, cache only data with an explicit staleness model, batch legitimate operations | cache must not conceal failed financial writes |
| Client timeout | distinguish timeout from auth/validation, improve queue behavior only for queueable failures | maintain the adapter error taxonomy and offline queue semantics |

## Delivery loop

1. Make the intervention behind the smallest seam possible.
2. Add a targeted regression test for the behavior that must not change.
3. Run normal package checks and all cross-package parity checks when touching a shared contract.
4. Repeat the baseline measurement under the same conditions.
5. If backend mutation behavior changed, run an explicitly authorized live shakedown as the final gate.
6. Publish the before/after evidence and residual risk in the issue; create or revise an ADR for a future-constraining decision.

## Hard boundaries

- Do not increase timeouts or retry counts merely to mask an unexplained regression.
- Do not bypass ADR-0009's shared document lock to improve throughput.
- Do not make frontend-derived financial aggregates as a latency shortcut; derived metrics belong in MASTER/STATS (ADR-0011).
- Do not expose or log secrets while instrumenting requests.

## When NOT to use this skill

- One failing or slow request still being diagnosed → `money-sheet-debugging-playbook` and `money-sheet-diagnostics-and-tooling`.
- General GAS API/runtime questions → `sheets-gas-reference`.
- Test plan and shakedown mechanics → `money-sheet-validation-and-qa`.

## Provenance

- Lock contract: ADR-0009.
- Derived-metrics contract: ADR-0011.
- Offline queue semantics: ADR-0004.
- Timeout/error boundary: `frontend/src/lib/adapter-real.ts` and `frontend/src/lib/api.ts`.
