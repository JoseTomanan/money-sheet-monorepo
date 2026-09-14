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

GAS loads all files from `dist/` alphabetically in a single global scope — there are no modules at runtime. The numeric filename prefixes (`0_types.ts`, `1_sheets.ts`, …, `9_main.ts`) set load order explicitly. Types defined in earlier files are therefore available to later ones without any imports.

### src/lib/ — testable modules and dependency roles

Files under `src/lib/` use ES module syntax so Vitest and the frontend's narrow pure-module imports can consume them. Production modules are migrating into `domain/`, `application/`, `presentation/`, and `infrastructure/`; only `composition.ts` may wire Presentation to Infrastructure. `scripts/architecture.test.js` enforces that dependency direction while exact migration allowlists permit the remaining flat modules and root artifacts.

The `scripts/strip-exports.js` post-build step recursively reads compiled role modules, validates supported module syntax and exported-global uniqueness, and emits deterministic flat filenames in dependency order. It strips supported relative imports/exports because GAS has no module loader. Existing flat `lib` modules remain supported during migration; never bypass this step or hand-edit `dist/`.

The corresponding `_*_globals.ts` files (`_week_globals.ts`, `_setup_globals.ts`, `_menu_globals.ts`, `_config_globals.ts`, `_entries_globals.ts`, `_dispatch_globals.ts`, `_repository_globals.ts`, `_locking_globals.ts`) declare ambient global types so the non-module GAS files can call those functions without TypeScript errors. They're plain `.ts` files, not `.d.ts` — `tsconfig.json` sets `skipLibCheck: true`, which silently skips type-checking of `.d.ts` files (including hand-written ones), so a `.d.ts` mirror could drift from the lib module it mirrors without `tsc --noEmit` ever catching it. Each mirror derives its types from the corresponding `src/lib/*.ts` module via `typeof import(...)` rather than hand-copying the signature, so a drift there is a compile error (issue #109). `_contract_parity.ts` additionally asserts the GAS-global domain types in `0_types.ts`/`2_entries.ts` stay structurally identical to `src/lib/dispatch.ts`'s canonical wire types.

### tsconfig split

- `tsconfig.json` — GAS build: target ES2019, `types: ["google-apps-script"]`, excludes `*.test.ts`
- `tsconfig.test.json` — Vitest: extends the above but sets `module: esnext` and clears `types: []` so imports work in tests without the GAS globals

Only pure `lib/` functions can be unit tested locally. Any function that calls `SpreadsheetApp`, `PropertiesService`, `LockService`, etc. must be tested against the real GAS deployment.

### Key invariants

- **`src/lib/0_sheetLayout.ts` is the single coordinate source of truth.** All fixed GAS-managed sheet names and 1-based row/column coordinates live in `SHEET_LAYOUT`; range widths, returned-array indices, and generated A1 references are derived from it. The `0_` prefix makes the runtime definition load before other stripped lib files, and `_sheetLayout_globals.ts` exposes it to numbered GAS files.
- **Col H (Entry ID)** is the stable row identifier written by `addEntry` and never reused or overwritten by `updateEntry`.
- **Col D (MAIN_CAT)** is ARRAYFORMULA-driven in the sheet — GAS never writes to it. After `addEntry`, `SpreadsheetApp.flush()` is called and col D is read back to return the resolved `mainCategory`.
- **MASTER data row** is always row 3. Do not use `getLastRow()` to locate it; extra formula rows below would give a wrong index.
- **Separator rows** are identified by a blank col H (ID). They hold a week-start `Date` in col B and a formatted label in col E.
- **Every `INCOMING/OUTGOING` mutation shares one `DocumentLock`.** Not just `addEntry`/`addEntries`/`updateEntry`/`deleteEntry` (`2_entries.ts`) — the weekly separator/visibility trigger (`applyRowVisibilityForActiveSheet`, `5_visibility.ts`) also inserts/shifts rows and must hold the same lock, or an in-flight insert's `insertRowBefore`/`writeEntryFields` pair can be raced and left with a blank, ID-less row. All lock-holding call sites go through `runExclusive` (`src/lib/locking.ts`) rather than inline `waitLock`/`releaseLock`. See ADR-0009.
- **Categories sheet uses merged cells** for the Category column — `getValues()` returns the value only in the first cell of a merge, so `4_categories.ts` tracks `currentCategory` as it walks rows.
