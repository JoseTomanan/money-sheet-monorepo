---
name: money-sheet-proof-and-analysis-toolkit
description: Build focused correctness proofs for money-sheet-monorepo changes, especially timezone/week parity, frontend–clasp wire contracts, validation equivalence, atomic batch behavior, ordering, and concurrency invariants. Use when a fix needs stronger evidence than an ordinary regression test or when reasoning spans package and runtime boundaries.
---

# Proof and analysis toolkit

Turn the claim into an executable invariant. A proof is useful here only when it fails for the historical or plausible counterexample and protects every implementation that must remain aligned.

## Select the proof shape

| Claim | Proof shape | Existing anchor |
|---|---|---|
| Frontend and clasp accept the same tags | enumerate/generate tag × direction cases and compare outcomes | `frontend/src/lib/parity.test.ts` |
| Week grouping is timezone-independent | test boundary dates under multiple `TZ` values and compare the string algorithms | `frontend/src/lib/parity.test.ts`, `clasp/src/lib/weeks.test.ts`, `frontend/src/lib/groupEntries.test.ts` |
| Wire shape cannot drift | compile type-level equality/assignability guards in all packages | `clasp/src/_contract_parity.ts`, `frontend/src/lib/wire-contract.parity.ts`, `tests/src/wire-contract.parity.ts` |
| `addEntries` is all-or-nothing | construct an invalid later leg and assert no collaborator writes; assert ordered IDs on valid batches | `clasp/src/lib/dispatch.test.ts`, `clasp/src/lib/repository.test.ts` |
| Mutations preserve row/lock safety | use injected lock/repository fakes to assert acquire → operation → release, including failure paths | `clasp/src/lib/locking.test.ts` |
| Offline replay remains valid | enumerate queue-operation sequences and assert the resulting queue has no dangling dependency | `frontend/src/lib/queue.test.ts` |

## Proof loop

1. State the invariant in one sentence and name its counterexample.
2. Locate every independent implementation and boundary that can violate it.
3. Add a deterministic test at the narrowest seam that exercises the counterexample.
4. For duplicated algorithms or types, prove equivalence across implementations rather than testing only one copy.
5. Run the relevant package suite and every existing guard that owns the invariant.

## Invariant rules

- Keep `Date` host-timezone behavior out of canonical week-string logic; use explicit `YYYY-MM-DD` arithmetic and test year boundaries.
- Keep contract guards as checked `.ts` files. `skipLibCheck` means a `.d.ts` guard could be ignored.
- For atomicity, prove that validation happens before writes; an eventual cleanup assertion alone does not establish atomic behavior.
- For concurrency, assert `finally` release and shared-lock use; happy-path serialization is insufficient.
- A randomized/property-style test must be seedable or have a small reproducible failing case.

## When NOT to use this skill

- Ordinary unit/component/E2E test selection → `money-sheet-validation-and-qa`.
- A symptom is not yet understood → `money-sheet-debugging-playbook`.
- Architecture rules and their enforcement sites → `money-sheet-architecture-contract`.

## Provenance

- Cross-package guard inventory: `money-sheet-change-control`.
- Canonical week definition: `CONTEXT.md`.
- Atomic batch contract: ADR-0008.
- Shared-lock contract: ADR-0009.
