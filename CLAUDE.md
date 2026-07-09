# CLAUDE.md

A personal finances tracker. Google Apps Script (GAS) backend exposing an HTTP API over a Google Sheets spreadsheet; Svelte 5 frontend deployed to GitHub Pages.

## Repo structure

```
money-sheet-monorepo/
├── clasp/          # GAS TypeScript source — independent package
├── frontend/       # Svelte 5 + Vite + Tailwind v4 — independent package
├── CONTEXT.md      # Domain glossary — read this first
└── docs/adr/       # Architecture decision records
```

Each package has its own `package.json`. There is no root workspace. They share no code.

## Domain

Read `CONTEXT.md` for canonical term definitions before touching any code. Key rules:

- **Tag is polymorphic**: Category on Incoming entries, Subcategory on Outgoing entries
- **GAS never writes to MASTER** — it is entirely formula-driven
- **Entry ID** (col H, INCOMING/OUTGOING) is the stable identifier for edit/delete — written by GAS on insert, never reused
- **Budget** = Category incoming − outgoing under its subcategories, rolling all-time
- **Per-subcategory breakdown** = outgoing spend only (no incoming at subcategory level)

## Spreadsheet sheet layout

| Sheet | Purpose |
|---|---|
| INCOMING/OUTGOING | All entries. `B=DATE \| C=TAG \| D=[VLOOKUP] MAIN CATEGORY \| E=DESCRIPTION \| F=I/O \| G=AMOUNT \| H=ENTRY ID` |
| MASTER | Single formula row: ON HAND + per-Category Budget. Read-only for GAS. |
| Categories | Subcategory→Category mapping. Adding a row here auto-updates VLOOKUP in col D. |

## clasp/

Google Apps Script written in TypeScript, pushed via [clasp](https://github.com/google/clasp).

**Commands** (run from `clasp/`):
```bash
npm install        # install deps
clasp push         # push to GAS (requires clasp login)
npx tsc --noEmit   # type-check locally
```

**API pattern** — `doGet` for reads (unauthenticated), `doPost` for all mutations (require `API_SECRET` in GAS Script Properties):

| Action | Method | Auth |
|---|---|---|
| `getEntries` | GET | none |
| `getMaster` | GET | none |
| `getCategories` | GET | none |
| `getSubcategoryBreakdown` | GET | none |
| `addEntry` | POST | secret |
| `addEntries` | POST | secret |
| `updateEntry` | POST | secret |
| `deleteEntry` | POST | secret |

`addEntry` writes `ENTRY ID` to col H as an auto-incrementing integer (max existing ID + 1). `addEntries` inserts an ordered array of entries atomically under one document lock (validate-then-write, no partial writes) — see ADR-0008.

**Auth**: shared secret passed as `body.secret` in POST requests. Stored in GAS Script Properties as `API_SECRET`. OAuth is deferred.

## frontend/

Svelte 5 + Vite + Tailwind v4. No SvelteKit. Single-page app; view switching via component switcher if multi-view is needed.

**Commands** (run from `frontend/`):
```bash
npm install
npm run dev -- --port 1111   # local dev server — port 1111 is dedicated to this project
npm run build                # outputs to dist/
```

**Dev server port**: always use `--port 1111`. If port 1111 is already listening, it is this project's server — do not launch another. Never start a server on a different port.

**Key behaviors:**
- I/O selection determines Tag picker domain: Incoming → Categories only; Outgoing → Subcategories only (grouped by Category)
- All data fetching is client-side via `fetch()` to the GAS web app URL
- GAS URL and API secret stored as Vite env vars (`VITE_GAS_URL`, `VITE_API_SECRET`)
- **CSS rule**: Use Tailwind for everything — see `docs/adr/0006` for the full rules. Short version: component `<style>` blocks should be empty or near-empty; `app.css` is the home for all `@keyframes`, `@utility` blocks (shared Tailwind combos extracted via `@apply`), `:root` tokens, and global resets. Use `group-*`/`peer-*` variants for parent→child hover/state instead of reactive JS variables. Inline `style=` is only permitted for runtime-computed values (colors from data, animation transforms, chart dimensions).

## Deployment

- **GAS**: GitHub Actions runs `clasp push -f` on push to `master`, using `CLASP_CREDENTIALS` secret
- **Frontend**: GitHub Actions builds `frontend/` and deploys `dist/` to GitHub Pages

## ADRs

- `docs/adr/0001` — Unified INCOMING/OUTGOING sheet (vs per-month sheets)
- `docs/adr/0002` — GAS HTTP API + shared-secret write auth
- `docs/adr/0003` — Plain Svelte 5 + Vite, no SvelteKit
- `docs/adr/0006` — Tailwind CSS usage rules (utilities, `@apply`, `group-*`, inline `style=`)

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default triage label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo: one `CONTEXT.md` + `docs/adr/` at the root. See `docs/agents/domain.md`.
