---
name: money-sheet-validation-and-qa
description: Choose and run the right money-sheet-monorepo validation evidence: unit/type/parity checks, mock-browser E2E, or deliberately authorized live-sheet integration and shakedown. Use when adding or changing tests, deciding which commands prove a change, interpreting CI coverage, or preparing a release after frontend, clasp, or cross-package work.
---

# Validation and QA

Match the evidence to the change. Run commands from the package named below; this repo has three independent npm packages, not a root workspace.

## Evidence map

| Change | Required evidence | Add when behavior changes |
|---|---|---|
| `clasp/` implementation | `npx tsc --noEmit` and `npm run test:run` | focused `src/**/*.test.ts` unit test with injected GAS collaborators |
| `frontend/` logic or UI | `npm run check` and `npm run test:run` | focused Vitest test; component test for rendered behavior |
| User flow, keyboard behavior, layout, or selectors | frontend checks plus `npm run test:e2e` | Mock Mode Playwright spec in `frontend/e2e/` |
| Wire types, tag validation, or week logic crossing packages | all clasp and frontend checks plus `cd tests && npm run typecheck` | preserve the type guards and `frontend/src/lib/parity.test.ts`; update both sides together |
| Real GAS and spreadsheet mutation path | normal local checks; then an explicitly authorized live test | `cd tests && npm test` for integration, or `cd frontend && npm run shakedown` for full CRUD |

CI runs the first three package-level checks on every push/PR. It deliberately does not run live integration tests because they need credentials.

## Tight local loop

1. Start with the smallest affected test file, then run its package suite.
2. Run type checking before declaring success; frontend `svelte-check` and clasp TypeScript checks catch different drift.
3. For cross-package behavior, run all contract/parity gates. A failed guard means the implementation drifted, not that the guard should be relaxed.
4. Use Mock Mode E2E for deterministic browser coverage. `npm run test:e2e` starts or reuses port 1111 with `VITE_MOCK=true`; it must never need real credentials.

## Live-test boundary

`tests/.env` contains `GAS_URL` and `API_SECRET`; it is gitignored and its values must never appear in output or commits. Both live suites mutate the real spreadsheet.

- `cd tests && npm test` exercises integration contracts against GAS.
- `cd frontend && npm run shakedown` runs serial, headed real-browser CRUD. It creates rows marked `__GOLIVECHK__…` and sweeps them in `afterAll`, but interrupted runs can leave rows behind. Run only with explicit authorization and inspect/clean any marked stragglers afterward.

For a backend mutation change, shakedown is a final confidence check, never a substitute for deterministic unit tests.

## Test design rules

- Test pure domain and transformation logic directly; inject GAS/browser collaborators at the boundary.
- Make regression tests reproduce the former bad input or ordering, then assert the user-visible/API outcome.
- Keep production behavior and test selectors compatible. If a UI change breaks E2E selectors, update the selectors in the same change.
- Never suppress a parity/type guard with `@ts-ignore`, delete it, or turn it into an assertion that cannot fail.
- Treat test flakiness as a defect to investigate; do not add retries except where an external live service genuinely needs bounded cold-start handling.

## Useful commands

```bash
cd clasp && npx tsc --noEmit && npm run test:run
cd frontend && npm run check && npm run test:run
cd frontend && npm run test:e2e
cd tests && npm run typecheck
```

## When NOT to use this skill

- Failure investigation and minimization → `money-sheet-debugging-playbook`.
- Measuring latency, cold starts, lock contention, or test performance → `money-sheet-diagnostics-and-tooling`.
- Environment provisioning and credentials → `money-sheet-build-and-env`.
- Merge/deploy policy → `money-sheet-change-control`.

## Provenance

- Scripts: `clasp/package.json`, `frontend/package.json`, `tests/package.json`.
- CI boundary: `.github/workflows/ci.yml`.
- E2E and shakedown behavior: `frontend/playwright.config.ts`, `frontend/shakedown/playwright.config.ts`, `frontend/shakedown/live-crud.spec.ts`.
