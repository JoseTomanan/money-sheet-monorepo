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
| `updateEntry` | POST | secret |
| `deleteEntry` | POST | secret |

`addEntry` writes `ENTRY ID` to col H as an auto-incrementing integer (max existing ID + 1).

**Auth**: shared secret passed as `body.secret` in POST requests. Stored in GAS Script Properties as `API_SECRET`. OAuth is deferred.

## frontend/

Svelte 5 + Vite + Tailwind v4. No SvelteKit. Single-page app; view switching via component switcher if multi-view is needed.

**Commands** (run from `frontend/`):
```bash
npm install
npm run dev      # local dev server
npm run build    # outputs to dist/
```

**Key behaviors:**
- I/O selection determines Tag picker domain: Incoming → Categories only; Outgoing → Subcategories only (grouped by Category)
- All data fetching is client-side via `fetch()` to the GAS web app URL
- GAS URL and API secret stored as Vite env vars (`VITE_GAS_URL`, `VITE_API_SECRET`)

## Deployment

- **GAS**: GitHub Actions runs `clasp push -f` on push to `master`, using `CLASP_CREDENTIALS` secret
- **Frontend**: GitHub Actions builds `frontend/` and deploys `dist/` to GitHub Pages

## ADRs

- `docs/adr/0001` — Unified INCOMING/OUTGOING sheet (vs per-month sheets)
- `docs/adr/0002` — GAS HTTP API + shared-secret write auth
- `docs/adr/0003` — Plain Svelte 5 + Vite, no SvelteKit

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default triage label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo: one `CONTEXT.md` + `docs/adr/` at the root. See `docs/agents/domain.md`.
