---
name: money-sheet-build-and-env
description: Recreate the money-sheet-monorepo working environment from scratch — fresh clone to green typecheck/tests/dev server — with every known trap. Use when setting up a new machine or clean checkout, when npm install/typecheck/tests fail on a fresh clone, when "Cannot find module ../../../clasp/src/lib/weeks" appears in frontend tests, when tempted to unify vitest or typescript versions across packages (they intentionally differ), when tests/ fails with missing GAS_URL/API_SECRET env vars, when port 1111 is "already in use" (EADDRINUSE / strictPort), when wondering why _*_globals.ts files are .ts not .d.ts (skipLibCheck), when matchMedia is not a function in vitest, when clasp push says not logged in, or when provisioning the spreadsheet side (template copy, Autohide → Run setup, web app deployment, where API_SECRET lives). NOT for day-to-day running/deploying — that is money-sheet-run-and-operate.
---

# Build and environment setup

Recreate the working environment from a fresh clone to green checks. All paths relative to the repo root. Facts date-stamped (as of 2026-07-10).

## Prerequisites

| Requirement | Why |
|---|---|
| Node 20 | All CI jobs pin `node-version: "20"` (`.github/workflows/ci.yml`) |
| npm | Lockfiles are `package-lock.json` in each package |
| `npx @google/clasp login` | Only needed for `npm run push` from `clasp/` (writes `~/.clasprc.json`). CI uses the `CLASP_CREDENTIALS` repo secret instead. Not needed for typecheck/test/build. |

## Install: three independent packages, no root workspace

There is NO root `package.json`. Install each package separately:

```bash
cd clasp && npm install && cd ../frontend && npm install && cd ../tests && npm install
```

## Per-package verification (run all three to confirm a healthy env)

| Package | cwd | Commands |
|---|---|---|
| clasp (GAS backend) | `clasp/` | `npx tsc --noEmit` · `npm run test:run` · `npm run build` (= `tsc && node scripts/strip-exports.js` → `dist/`) |
| frontend (Svelte 5 SPA) | `frontend/` | `npm run check` (svelte-check) · `npm run test:run` · `npm run build` · `npm run dev -- --port 1111` |
| tests (live integration) | `tests/` | `npm run typecheck` · `npm test` (needs `tests/.env` — see below; hits the REAL sheet, run deliberately) |

**Port 1111 is law.** `frontend/vite.config.ts` sets `port: 1111, strictPort: true`. If port 1111 is already listening, it IS this project's dev server — reuse it; never start another server or use a different port. Playwright e2e (`frontend/playwright.config.ts`) auto-starts/reuses the same server with `VITE_MOCK=true`.

## Environment files (all gitignored — NEVER commit or print contents)

| File | Create from | Keys |
|---|---|---|
| `tests/.env` | `cp tests/.env.example tests/.env` | `GAS_URL` (web app `/exec` URL), `API_SECRET` |
| `frontend/.env` | `frontend/.env.example` (optional) | `VITE_MOCK` (`"true"` forces Mock Mode), `VITE_GAS_URL` + `VITE_API_SECRET` (dev-only auto-connect, skips the setup gate — `src/lib/connection.svelte.ts:8`) |

Without any `.env`, the frontend still works in Mock Mode; `tests/` cannot run at all. Local `.env` files may contain REAL credentials.

## Spreadsheet-side environment (one-time, per README.md "Setup")

1. **Copy the template**: open the Google Sheet template linked in `README.md` (docs.google.com/spreadsheets/d/1dW0X378z9MXCqZ9YK2oxCqk3FjX6TUP2h7yLSdjmd6g) → **Use Template**. Gives you INCOMING/OUTGOING, MASTER, Categories sheets with the GAS script attached. `setup()` does NOT create these sheets — only the template does.
2. **Run setup**: sheet menu **Autohide → Run setup** (or Apps Script editor → run `setup`). Generates a random API secret into GAS **Script Properties** key `API_SECRET` and shows it once in an alert — copy it then. That Script Property is the single source of truth for the secret.
3. **Deploy the web app**: Apps Script → **Deploy → New deployment** → Execute as: **Me**; Who has access: **Anyone**. Copy the `/exec` URL. (Matches `clasp/src/appsscript.json`: `executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`.)
4. Put URL + secret into the app's setup screen, and into `tests/.env` / `frontend/.env` as needed.

## Traps (each has bitten before — do not "fix" them)

| Trap | Truth (as of 2026-07-10) |
|---|---|
| vitest majors differ per package | clasp `^4.1.7`, frontend `^3.2.4`, tests `^2.1.8`. Intentional independence — do NOT unify casually; each package's config/tests are pinned to its major's behavior. |
| typescript versions differ | clasp+frontend `^5.4.5`, tests `^5.7.2`. Same rule. |
| `_*_globals.ts` are `.ts`, not `.d.ts` | `clasp/tsconfig.json` has `skipLibCheck: true`, which silently skips ALL `.d.ts` (even hand-written), so a `.d.ts` mirror could drift undetected. Plain `.ts` files are still checked; mirrors derive types via `typeof import("./lib/…")` so drift = `tsc` error (issue #109, `clasp/CLAUDE.md:29`). Never convert them to `.d.ts`. |
| Frontend tests import clasp SOURCE | `frontend/src/lib/parity.test.ts:16,19` and `wire-contract.parity.ts:24` import `../../../clasp/src/lib/*` by relative path. The `clasp/` source tree must exist beside `frontend/` — frontend cannot be tested from a partial checkout. |
| strict mode differs | `clasp/tsconfig.json` `strict: true`; `frontend/tsconfig.json` `strict: false`. Code moved between packages may newly fail (or newly pass) checks. |
| jsdom + matchMedia stub | Frontend unit tests run in `environment: "jsdom"` with `setupFiles: ["./src/test-setup.ts"]`, which stubs `window.matchMedia` (jsdom lacks it). A test bypassing this setup file dies with `matchMedia is not a function`. |
| `clasp/dist/` is generated | Never hand-edit; never `clasp push` without `npm run build` first (strip-exports removes `export ` keywords and relative imports — GAS has no module loader). Rationale and gates: `money-sheet-change-control`. |
| CLAUDE.md deploy branch is stale | Root CLAUDE.md says deploy on push to `master`; all workflows actually trigger on `main`. |

## Green-environment checklist

- [ ] `node --version` → v20.x
- [ ] `cd clasp && npx tsc --noEmit && npm run test:run` → 0 errors, all tests pass
- [ ] `cd frontend && npm run check && npm run test:run` → 0 errors (parity tests prove clasp/ is wired)
- [ ] `cd tests && npm run typecheck` → 0 errors (CI runs only typecheck here; `npm test` needs live creds)
- [ ] `cd frontend && npm run dev -- --port 1111` → serves at http://localhost:1111 (Mock Mode banner if no creds)

## When NOT to use this skill

- Day-to-day running, building, deploying, spreadsheet operations → `money-sheet-run-and-operate`.
- What a config key/env var/localStorage key MEANS → `money-sheet-config-and-flags`.
- Which test suite proves what, adding tests → `money-sheet-validation-and-qa`.
- GAS runtime theory (why strip-exports exists at all, global concat model) → `sheets-gas-reference`.
- A failing test/build that is NOT a fresh-env problem → `money-sheet-debugging-playbook`.

## Provenance and maintenance

Re-verify volatile facts before trusting this file:

- Node version: `grep -n node-version .github/workflows/ci.yml`
- Package versions/scripts: `grep -n -E '"(vitest|typescript)"' clasp/package.json frontend/package.json tests/package.json`
- Port law: `grep -n -A2 'server:' frontend/vite.config.ts`
- skipLibCheck + strict: `grep -n -E 'skipLibCheck|strict' clasp/tsconfig.json frontend/tsconfig.json`
- Cross-package imports: `grep -rn 'clasp/src/lib' frontend/src/lib/parity.test.ts frontend/src/lib/wire-contract.parity.ts`
- matchMedia stub: `grep -n matchMedia frontend/src/test-setup.ts`
- tests env keys: `cat tests/.env.example` (placeholder values only)
- Spreadsheet setup steps + template link: `grep -n -A6 '## Setup' README.md` and README sections 1–3
- clasp CI creds: `grep -n CLASP_CREDENTIALS .github/workflows/gas-deploy.yml`
