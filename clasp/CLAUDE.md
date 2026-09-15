# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Run from `clasp/`:

```bash
npm install
npx tsc --noEmit          # type-check only
npm run build             # tsc → dist/, then flatten/validate GAS modules
npm run push              # build + clasp push to GAS
npm test                  # vitest watch (lib and build/architecture tests)
npm run test:run          # vitest run (CI / single pass)
npx vitest run src/lib/weeks.test.ts   # run a single test file
```

## Architecture

### GAS execution model

GAS loads all files from `dist/` alphabetically in a single global scope — there are no modules at runtime. The source root contains only thin, globally named entrypoints; the build flattens implementation modules with deterministic role prefixes before deployment.

### src/lib/ — testable modules and dependency roles

Files under `src/lib/` use ES module syntax so Vitest and the frontend's narrow pure-module imports can consume them. Production modules are organized into `domain/`, `application/`, `presentation/`, and `infrastructure/`; only `composition.ts` may wire Presentation to Infrastructure. `scripts/architecture.test.js` enforces that dependency direction and rejects production artifacts outside the completed role layout.

The `scripts/strip-exports.js` post-build step prunes obsolete compiled artifacts, recursively reads compiled role modules, validates supported module syntax and exported-global uniqueness, and emits deterministic flat filenames in dependency order. It strips supported relative imports/exports because GAS has no module loader; never bypass this step or hand-edit `dist/`.

The single `_globals.ts` bridge declares the composition-root functions and GAS-global wire types used by the non-module entrypoints. It is a plain `.ts` file, not `.d.ts`: `skipLibCheck: true` would silently skip a declaration file. Every declaration derives from its owning module through `typeof import(...)` or an import type, so drift is a compile error. `_contract_parity.ts` retains the explicit wire-contract parity assertions.

### tsconfig split

- `tsconfig.json` — GAS build: target ES2019, `types: ["google-apps-script"]`, excludes `*.test.ts`
- `tsconfig.test.json` — Vitest: extends the above but sets `module: esnext` and clears `types: []` so imports work in tests without the GAS globals

Only pure `lib/` functions can be unit tested locally. Any function that calls `SpreadsheetApp`, `PropertiesService`, `LockService`, etc. must be tested against the real GAS deployment.

### Key invariants

- **`src/lib/infrastructure/sheetLayout.ts` is the single coordinate source of truth.** All fixed GAS-managed sheet names and 1-based row/column coordinates live in `SHEET_LAYOUT`; range widths, returned-array indices, and generated A1 references are derived from it.
- **Col H (Entry ID)** is the stable row identifier written by `addEntry` and never reused or overwritten by `updateEntry`.
- **Col D (MAIN_CAT)** is ARRAYFORMULA-driven in the sheet — GAS never writes to it. After `addEntry`, `SpreadsheetApp.flush()` is called and col D is read back to return the resolved `mainCategory`.
- **MASTER data row** is always row 3. Do not use `getLastRow()` to locate it; extra formula rows below would give a wrong index.
- **Separator rows** are identified by a blank col H (ID). They hold a week-start `Date` in col B and a formatted label in col E.
- **Every `INCOMING/OUTGOING` mutation shares one `DocumentLock`.** Entry mutations (`src/lib/infrastructure/entries.ts`) and weekly separator/visibility mutations (`src/lib/infrastructure/visibility.ts`) use the same lock through `runExclusive` (`src/lib/infrastructure/locking.ts`). See ADR-0009.
- **Categories sheet uses merged cells** for the Category column — `getValues()` returns the value only in the first cell of a merge, so `src/lib/infrastructure/categories.ts` carries the current Category as it walks rows.
