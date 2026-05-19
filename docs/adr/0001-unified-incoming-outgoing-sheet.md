# ADR-0001: Unified INCOMING/OUTGOING Sheet

**Status:** Accepted

## Context

The previous system (`finances-tracker-appsscript`) maintained separate sheets: one per month for outgoing expenses, and a separate INCOMING sheet for funds received. This made month-based aggregation easy but required GAS to create new sheets on rollover, maintain a MASTER SHEET with one row per month, and hide past weeks. Adding a new Tag category required updating `masterHeaderLabels` in code and the spreadsheet headers together.

## Decision

Use a single **INCOMING/OUTGOING** sheet for all Entries regardless of Direction or date. A `Direction` column (`I`/`O`) distinguishes incoming from outgoing. MASTER is a single formula-driven summary row, not a growing ledger.

## Consequences

- GAS never creates new sheets or writes to MASTER — the spreadsheet formulas handle all aggregation automatically.
- The GAS API is simpler: read/write/edit/delete rows on one sheet only.
- The Categories sheet VLOOKUP resolves Subcategory → Category, replacing the hardcoded `masterHeaderLabels` array.
- No concept of "current month" or period reset at the GAS or API layer (resets are out of scope for now).
- A new frontend (Svelte 5) can filter by date client-side without any GAS involvement.
