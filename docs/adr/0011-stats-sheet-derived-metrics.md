# ADR-0011: Derived Metrics Live in Formula-Driven Sheets, Not in Code

**Status:** Accepted

## Context

#128 (Summary revamp + Deeper statistics) needs several new derived numbers:
each Category's net change for the current calendar month, and a spending-pace
comparison of this month's cumulative outgoing against a trailing-months
"usual" baseline. None of these exist yet in any form.

The codebase already has one derived-computation precedent to choose between:

- **MASTER** — ON HAND and per-Category Budgets are single-row spreadsheet
  formulas (SUMIF over col D). GAS's `getMaster()` (`clasp/src/3_master.ts`)
  only reads the row back; it computes nothing.
- **Per-subcategory breakdown** — computed client-side in the frontend from
  `getEntries()` + `getCategories()`. There is no `getSubcategoryBreakdown`
  dispatch action; the frontend aggregates raw entries in TypeScript.

These are two different answers to "where does a derived number live," and
#128 explicitly needs to pick one before adding new metrics, because the
Deeper Statistics slice (#132) will extend whichever one is chosen.

## Decision

**All derived/computed metrics live in a formula-driven spreadsheet that GAS
only reads — the MASTER pattern, not the per-subcategory-breakdown pattern.**

A new **STATS** sheet is added, created by `ensureStatsSheet` (`clasp/src/lib/stats.ts`,
called from `setup()` in `clasp/src/7_setup.ts`, mirroring `ensureConfigSheet`).
Like MASTER, STATS is written once at creation time as live spreadsheet
formulas (SUMIFS, EOMONTH, IF/IFERROR — the same formula vocabulary MASTER's
SUMIF budgets use) and is **never written to by GAS afterward**. A new
`getStats` GET action (unauthenticated, like `getEntries`/`getMaster`/
`getCategories`/`getConfig`) reads it back via fixed anchor rows
(`STATS_ROWS`, `clasp/src/3_stats.ts`) — the same "never `getLastRow()`,
always a known row" invariant MASTER's "always row 3" enforces, extended to a
sheet with more than one data block.

**This explicitly supersedes the per-subcategory-breakdown decision.** That
computation currently lives in the frontend (issue history predates this
ADR; there is no earlier ADR recording it, only the CLAUDE.md line "The
per-subcategory breakdown is computed client-side from `getEntries` +
`getCategories` — there is no `getSubcategoryBreakdown` action"). Retiring
that client-side computation and replacing it with a sheet-formula
equivalent is tracked as its own epic sub-issue (#128, "Retire client-side
aggregation") — this ADR records the *decision*, not the migration.

**Wire shape** (`clasp/src/lib/dispatch.ts`):

```ts
interface CategoryMonthChange {
  category: string;
  incoming: number;
  outgoing: number;
  netChange: number;
}
interface SpendingPaceDay {
  day: number;                  // 1-31
  cumulativeThisMonth: number;
  cumulativeUsual: number;      // trailing-months average baseline
}
interface StatsData {
  categoryMonthChange: CategoryMonthChange[];
  spendingPace: SpendingPaceDay[];
}
```

Deliberately just two named arrays inside one object, not a monolithic row —
so #132's rolling-window (30d/3mo/12mo) extension to Deeper Statistics can add
sibling fields without breaking this parity contract. `StatsData` is a
canonical type in `dispatch.ts` (not `unknown`, unlike `MasterRow` and
`ConfigMap`'s wire arms) specifically so it participates in full structural
parity checking across all three guard files (`_contract_parity.ts`,
`frontend/src/lib/wire-contract.parity.ts`, `tests/src/wire-contract.parity.ts`),
same as `Entry`/`CategoryMap`.

## Consequences

- New metrics for #130 (Summary) and #132 (Deeper statistics) go into STATS
  sheet formulas first, `getStats` second, frontend rendering last — never
  the other way around. If a future metric can't reasonably be expressed as a
  sheet formula, that is a signal to revisit this ADR, not to quietly add
  TypeScript aggregation.
- Same accepted consequence as MASTER already has: **unsynced Local Entries
  don't move STATS numbers until they sync** to the real sheet. A category's
  month-change or the spending-pace line won't reflect an entry sitting in the
  offline queue.
- Same known weak point as MASTER: `STATS_CATEGORIES` in `clasp/src/lib/stats.ts`
  is a hardcoded 7-category list (mirroring `3_master.ts`'s own hardcoded
  list) — a new Categories-sheet row won't get a STATS row without a code
  change.
- **The STATS formulas have not been executed against a live spreadsheet.**
  They were written to match MASTER's SUMIF/ARRAYFORMULA conventions and are
  believed correct (date-boundary math, EOMONTH-based month bounds, a
  `TRAILING_MONTHS = 3` baseline), but verifying them — especially year-boundary
  EOMONTH behavior and behavior against a sheet with real separator rows — is
  explicitly deferred to manual verification against the real spreadsheet.
  This was the highest-flagged risk when #129 was scoped.
- Mock Mode's `mockGetStats` (`frontend/src/lib/mock.ts`) recomputes the same
  shape client-side, same as the pre-existing `mockGetMaster` — this is not a
  precedent for computing stats against a real Connection; `RealAdapter.getStats()`
  only ever reads.
