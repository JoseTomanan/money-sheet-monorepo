# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from `clasp/`:

```bash
npm install
npx tsc --noEmit          # type-check only
npm run build             # tsc → dist/, then strip exports from dist/lib/
npm run push              # build + clasp push to GAS
npm test                  # vitest watch (lib tests only)
npm run test:run          # vitest run (CI / single pass)
npx vitest run src/lib/weeks.test.ts   # run a single test file
```

## Architecture

### GAS execution model

GAS loads all files from `dist/` alphabetically in a single global scope — there are no modules at runtime. The numeric filename prefixes (`0_types.ts`, `1_sheets.ts`, …, `9_main.ts`) set load order explicitly. Types defined in earlier files are therefore available to later ones without any imports.

### src/lib/ — testable pure functions

Files under `src/lib/` (e.g. `weeks.ts`, `setup.ts`, `menu.ts`) use ES `export` keywords so Vitest can import them. The `scripts/strip-exports.js` post-build step rewrites `dist/lib/*.js` to remove the `export` keyword, making them plain globals at GAS runtime.

The corresponding `_*_globals.d.ts` files (`_week_globals.d.ts`, `_setup_globals.d.ts`, `_menu_globals.d.ts`) declare ambient global types so the non-module GAS files can call those functions without TypeScript errors.

### tsconfig split

- `tsconfig.json` — GAS build: target ES2019, `types: ["google-apps-script"]`, excludes `*.test.ts`
- `tsconfig.test.json` — Vitest: extends the above but sets `module: esnext` and clears `types: []` so imports work in tests without the GAS globals

Only pure `lib/` functions can be unit tested locally. Any function that calls `SpreadsheetApp`, `PropertiesService`, `LockService`, etc. must be tested against the real GAS deployment.

### Key invariants

- **Col H (Entry ID)** is the stable row identifier written by `addEntry` and never reused or overwritten by `updateEntry`.
- **Col D (MAIN_CAT)** is ARRAYFORMULA-driven in the sheet — GAS never writes to it. After `addEntry`, `SpreadsheetApp.flush()` is called and col D is read back to return the resolved `mainCategory`.
- **MASTER data row** is always row 3. Do not use `getLastRow()` to locate it; extra formula rows below would give a wrong index.
- **Separator rows** are identified by a blank col H (ID). They hold a week-start `Date` in col B and a formatted label in col E.
- **`addEntry` acquires a `DocumentLock`** to prevent ID collisions under concurrent requests.
- **Categories sheet uses merged cells** for the Category column — `getValues()` returns the value only in the first cell of a merge, so `4_categories.ts` tracks `currentCategory` as it walks rows.
