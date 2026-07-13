# 0005 — Fund Redistribution modeled as negative-amount Incoming Entries

**Status**: Accepted

## Context

Moving budget from one Category to another (e.g., ₱1,000 from LIFESTYLE to FOOD) requires two writes to the spreadsheet. The candidate approaches were:

1. **Outgoing + Incoming pair**: one Outgoing entry tagged to a Subcategory under the source Category, one Incoming entry tagged to the target Category.
2. **Negative-amount Incoming pair**: one Incoming entry with a negative amount (tag = source Category), one Incoming entry with a positive amount (tag = target Category).

## Decision

Use approach 2: a pair of Incoming Entries where the drain leg carries a negative amount.

## Reasons

- Outgoing entries require a Subcategory tag. Modeling a redistribution as Outgoing would require adding a dedicated `Redistribution` Subcategory to every Category in the Categories sheet, polluting the Subcategory namespace with a structural concept.
- Incoming entries use Category tags directly. A negative-amount Incoming entry reduces `sum(Incoming where tag=Category)` by the transferred amount — the Budget formula absorbs it naturally with no schema changes.
- The two redistribution legs are structurally symmetric (both Incoming), making them easy to identify as a pair by description convention.

## Consequences

- `amount` on an Incoming Entry may be negative (or zero). This is the only case where a negative amount is valid; Outgoing entries must always have a positive amount.
- This applies to the manual entry form as well, not only the dedicated Redistribute flow — a user may type a negative amount directly on an Incoming entry (`evaluateAmountInput`/`resolveAmountOnBlur` in `frontend/src/lib/formula.ts` take an `allowNegative` flag, set from `direction === 'I'`).
- `EntryRow` must not blindly prefix a `+` sign when `direction === 'I'` — it must check `amount >= 0` first.
- The MASTER sheet formulas are unaffected; `SUMIF` on the INCOMING/OUTGOING sheet correctly sums negative values.
