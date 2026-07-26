# ADR-0012: Amount-Input Policy Lives Behind a Named Seam, Never a Threaded Boolean

**Status:** Accepted

## Context

Two amount-input fields in the frontend need different positivity rules: the
manual entry form (`SplitLegCarousel`) accepts any sign, including zero
(ADR-0005); the Fund Redistribution "Amount to move" field (`RedistributeSheet`)
must stay strictly positive — moving ≤ 0 between Categories has no meaning.

Both fields were built on the same three `formula.ts` primitives
(`sanitizeAmountInput`, `resolveAmountOnBlur`, `evaluateAmountInput`), and the
difference between the two policies was expressed as an `allowNegative`
boolean parameter that every call site had to pass consistently.

That shape produced two bugs:

- **#134/#136.** The Add Entry sheet's blur handler and its `saveDisabled`
  check each independently decided `allowNegative = direction === 'I'`. The
  sheet defaults to Outgoing, so #134's fix silently didn't apply to the
  common case — Save stayed greyed out for a negative or zero amount on a
  fresh Outgoing entry, with no visible reason.
- **A live grammar bug found while investigating #136.** `sanitizeAmountInput`'s
  character allowlist (`0-9 . + - * / ( )`) is wider than `evaluateFormula`'s
  actual grammar (`+`, `-`, `SUM(...)` only), and `evaluateAmountInput` /
  `resolveAmountOnBlur` each had their own regex for "is this a plain number"
  that disagreed on `*`/`/`/`(`/`)`. Typing `5*3` took the plain-number branch,
  `Number("5*3")` was `NaN`, and the code fell through to the *positivity*
  error message ("Amount must be positive") for what was actually a malformed
  expression.

Both bugs trace to the same root cause: a policy decision (what counts as
valid, what to do about non-positive results) was repeated at multiple call
sites instead of being made once, in one place.

## Decision

Introduce `frontend/src/lib/amountField.ts` exporting two named adapters,
each implementing one `AmountField` interface (`sanitize` / `resolve` /
`validate`):

- **`entryAmount`** — any sign, including zero. Used by manual Add/Edit Entry
  (`SplitLegCarousel.svelte`, `splitEntry.ts`'s `validateLeg`).
- **`redistributionAmount`** — must be strictly positive. Used by
  `RedistributeSheet.svelte` alone.

`amountField.ts` is the only module that chooses a value for `formula.ts`'s
`allowNegative` parameter. Every caller imports a named adapter and calls
`.sanitize()` / `.resolve()` / `.validate()` — there is no boolean left to
thread, and no way for a blur handler and a validity check to disagree about
which policy applies, because both read from the same adapter.

`formula.ts`'s primitives (`sanitizeAmountInput`, `resolveAmountOnBlur`,
`evaluateAmountInput`, `evaluateFormula`) are unchanged in shape and still
directly exported — `amountField.ts` is a thin, deep wrapper over them, not a
replacement.

Separately (not a policy question, but found and fixed alongside this): the
"plain number" detection in `evaluateAmountInput` and `resolveAmountOnBlur`
now shares one `HAS_OPERATOR` regex, and a non-finite plain-number parse
returns `"Invalid formula"` rather than `"Amount must be positive"`.

## Consequences

- Adding a third amount-input policy (if one is ever needed) means adding a
  third named export from `amountField.ts`, not adding a new boolean
  parameter to thread through `formula.ts` and every call site.
- `splitEntry.ts`'s `validateLeg` / `validateSplit` (introduced alongside this
  ADR) call `entryAmount.validate` directly — Leg amount validity and Leg tag
  validity (via `isValidTag`, unchanged) are now both answered from one
  function, which can report *why* a Leg is invalid, not just whether.
- `5*3`, `10/2`, `(5)` — characters `sanitizeAmountInput` allows through but
  `evaluateFormula`'s grammar has never supported — now correctly report
  `"Invalid formula"` on blur. `evaluateFormula`'s grammar itself is
  unchanged; extending it to support `*`/`/` was considered and deferred as a
  separate, larger change (real operator-precedence parsing) with no current
  driving need.
- Supersedes the informal "pass `allowNegative`/`direction === 'I'`" pattern
  referenced in ADR-0005's Consequences section as of #134; ADR-0005 is
  amended to point here for the mechanism, while its core decision (Fund
  Redistribution modeled as a negative-amount Incoming pair) is untouched.
