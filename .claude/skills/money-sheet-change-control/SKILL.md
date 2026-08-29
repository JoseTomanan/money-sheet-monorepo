---
name: money-sheet-change-control
description: How changes are classified, gated, and reviewed in money-sheet-monorepo — the non-negotiable rules with their rationale and incident history. Use when starting any change (feature, fix, refactor, docs), when deciding whether to open a GitHub issue first, when a parity test or _contract_parity.ts / wire-contract.parity.ts guard fails and you are tempted to relax it, when tempted to edit clasp/dist/ or skip scripts/strip-exports.js, when writing a commit message (conventional commits, no Co-Authored-By), when wondering what CI (ci.yml) must pass before merge, what triggers gas-deploy.yml / pages-deploy.yml, how triage labels (needs-triage, ready-for-agent…) flow, or whether a change needs an ADR ("Contradicts ADR-000X"). Trigger phrases: "can I just delete this failing parity test", "type error in _contract_parity.ts", "clasp push failed with export keyword", "which branch deploys", "does this need an issue/ADR".
---

# Change control for money-sheet-monorepo

Repo root: `/Users/jdtomanan/Documents/GitHub/money-sheet-monorepo`. Volatile facts verified as of 2026-07-10.

## The three non-negotiables (owner's unwritten rules, now written)

### 1. Issue-first workflow
Every non-trivial change starts as a GitHub issue, triaged and labeled **before code**.
- **Why**: this repo's history is navigable only because every saga maps to issue numbers (the today()/UTC drift is #93→#108; atomic addEntries is #46→#111; DocumentLock races are #92). Issues are the evidence trail that lets future agents reconstruct why code looks the way it does, and triage labels route work between humans and AFK agents.
- **Do**: `gh issue create --title "..." --body "..."` (from repo root; recipes in `docs/agents/issue-tracker.md`), apply `needs-triage`, get it to `ready-for-agent` or `ready-for-human` before writing code. Reference the issue in commits/PRs (`(#N)`).
- **Exempt**: trivial doc typo fixes, comment corrections.

### 2. Parity checks are sacred
Never weaken, delete, or `@ts-ignore` a parity test or type-level parity guard to make a change compile. A parity failure means the two packages have drifted — fix the change so it goes through **both packages in tandem**, in the same PR.
- **The guards** (4 files): `clasp/src/_contract_parity.ts`, `frontend/src/lib/wire-contract.parity.ts`, `tests/src/wire-contract.parity.ts` (type-level, fire under `tsc`/`svelte-check`), and `frontend/src/lib/parity.test.ts` (runtime: `weekStartOf ≡ weekStartOfStr`, `weekLabel ≡ weekLabelFromStr`, `isValidTag ≡ checkTagDirection`).
- **Why**: the wire contract (Entry, AddEntryPayload, UpdateEntryPatch, CategoryMap, ConfigMap) existed as 5 hand-copies across packages until issue #109 pinned them with `__Equal/__Expect` type guards — drift is now a `tsc --noEmit` error by design. The runtime parity tests exist because week-start and tag-validation logic once diverged silently between clasp and frontend (part of the #93→#108 timezone saga and the #123 bare-Category saga). Weakening a guard restores exactly the silent drift these were built to kill.
- Note: `_contract_parity.ts` is deliberately `.ts` not `.d.ts` — `skipLibCheck: true` would silently skip a `.d.ts` guard. Do not "clean it up" into a declaration file.

### 3. Never edit `clasp/dist/` or bypass `scripts/strip-exports.js`
`clasp/dist/` is generated (and gitignored). Always push via `npm run push` (= `tsc && node scripts/strip-exports.js && npx @google/clasp push -f`), never a bare `clasp push` on a stale/hand-edited dist.
- **Why**: GAS concatenates all pushed files into ONE global scope with no module loader. `strip-exports.js` removes `export ` keywords and relative `import {…} from "./…"` lines from `dist/lib/*.js` — without it the pushed code crashes at load. **Incident**: commit `dfe81d4` — `.clasp.json` `rootDir` once pointed at `./src`, so clasp uploaded raw ES-module TypeScript output directly and broke the deployment; the fix set `rootDir: ./dist` and introduced `strip-exports.js`. Hand-edits to dist are silently lost on the next build.

## House rules: commits

- **Conventional commits mandatory**: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:` (scope optional, e.g. `fix(clasp):`). Verify style: `git log --oneline -20`.
- **Never append `Co-Authored-By`** to commits or PRs — owner handles attribution elsewhere.
- Commit/push only when asked; branch off `main` first if on it.

## Gates: CI and deploy (as of 2026-07-10)

`ci.yml` runs on every PR and push to `main` — all three jobs must pass before merge:

| Job | cwd | Commands |
|---|---|---|
| clasp | `clasp/` | `npx tsc --noEmit` && `npm run test:run` |
| frontend | `frontend/` | `npm run check` (svelte-check) && `npm run test:run` |
| tests | `tests/` | `npm run typecheck` only (live integration suite needs GAS creds, deliberately not in CI) |

Deploys — push to **`main`**, path-filtered (root CLAUDE.md says `master`; that is **stale** — all three workflows declare `branches: [main]`):
- `gas-deploy.yml`: paths `clasp/**` → `npm run build` → `clasp push -f` → `clasp deploy` to a hardcoded deploymentId (secret `CLASP_CREDENTIALS`). Also `workflow_dispatch`.
- `pages-deploy.yml`: paths `frontend/**` → build → GitHub Pages. Also `workflow_dispatch`.
- Corollary: **merging to main IS deploying**. A clasp merge goes live on the real spreadsheet's API immediately.

## Triage-label lifecycle (`docs/agents/triage-labels.md`)

`needs-triage` (new, unevaluated) → maintainer triage → `needs-info` (blocked on reporter) | `ready-for-agent` (fully specified, an AFK agent can take it) | `ready-for-human` | `wontfix` (closed, not actioned). Apply/remove with `gh issue edit <n> --add-label "..." / --remove-label "..."`. Full gh recipes: `docs/agents/issue-tracker.md`.

## ADR process (`docs/adr/0001`–`0009`, `docs/agents/domain.md`)

- **Needs an ADR**: any decision that constrains future work — sheet schema/layout, wire contract shape, auth model, locking/atomicity semantics, CSS/component-library policy, offline-queue semantics. Pattern: numbered `docs/adr/NNNN-slug.md`, committed as `docs:`.
- **Escalation rule**: if your change contradicts an existing ADR, surface it explicitly — *"Contradicts ADR-000X (title) — but worth reopening because…"* — never silently override. Read `CONTEXT.md` and relevant ADRs before working; use the glossary's vocabulary exactly.
- 0009 exists (`0009-io-sheet-mutations-share-one-lock.md`) — some docs still say the range ends at 0008.

## Change-classification table

| Change class | Issue first | Gates before merge | Deploy effect |
|---|---|---|---|
| Docs-only (`*.md`, ADRs) | Optional | CI still runs; conventional `docs:` commit | None |
| Frontend-only | Yes | `frontend/`: `npm run check` + `npm run test:run`; e2e (`npm run test:e2e`) if UI flow touched | Pages deploy on merge |
| clasp-only | Yes | `clasp/`: `npx tsc --noEmit` + `npm run test:run`; consider shakedown (below) | **Live GAS API redeploys on merge** |
| Cross-package contract change (wire types, week logic, tag validation) | Yes, always | ALL of: clasp tsc+tests, frontend check+tests, `tests/` `npm run typecheck`, runtime parity (`frontend/src/lib/parity.test.ts` runs inside frontend `test:run`) — change both packages in one PR, guards untouched | Both deploys fire |
| Spreadsheet-template change (sheet layout, columns, MASTER formulas, Categories) | Yes + likely ADR | No CI can catch this — manual verification against a live/copy sheet; update `CONTEXT.md` + root CLAUDE.md layout table | Immediate on the sheet itself |

**Shakedown caution**: `frontend/` `npm run shakedown` runs live CRUD against the **real** spreadsheet (creds from gitignored local files — never quote values). Run only deliberately, as a final gate on clasp mutation changes. Details, sweep behavior, and the full test-suite inventory: see `money-sheet-validation-and-qa`.

## When NOT to use this skill

- Diagnosing a failure → `money-sheet-debugging-playbook`; its history → `money-sheet-failure-archaeology`.
- What the design invariants ARE (vs how changes to them are gated) → `money-sheet-architecture-contract`.
- Running tests / what counts as evidence / shakedown mechanics → `money-sheet-validation-and-qa`.
- Executing a deploy or spreadsheet op → `money-sheet-run-and-operate`; building the env → `money-sheet-build-and-env`.
- Writing/maintaining the docs of record themselves → `money-sheet-docs-and-writing`.

## Provenance and maintenance

Verified against the repo 2026-07-10. Re-verify before trusting:

- CI/deploy triggers & jobs: `cat .github/workflows/ci.yml .github/workflows/gas-deploy.yml .github/workflows/pages-deploy.yml`
- Parity guard files still exist: `ls clasp/src/_contract_parity.ts frontend/src/lib/wire-contract.parity.ts frontend/src/lib/parity.test.ts tests/src/wire-contract.parity.ts`
- Build/push chain: `grep -n '"build"\|"push"' clasp/package.json`
- strip-exports behavior: `head -25 clasp/scripts/strip-exports.js`
- Triage labels: `gh label list` vs `docs/agents/triage-labels.md`
- ADR count: `ls docs/adr/`
- Incident SHAs: `git log --oneline | grep -E "dfe81d4|2b438ab|8ac9a83"`
