import {
  sanitizeAmountInput,
  resolveAmountOnBlur,
  evaluateAmountInput,
  type FormulaResult,
  type AmountBlurResult,
} from "./formula";

/**
 * A named amount-input policy: sanitize (oninput), resolve (onblur), and
 * validate (disabled-button derived) always agree on whether a non-positive
 * result is acceptable, because they share one `allowNegative` choice made
 * exactly once, here.
 *
 * This exists because that choice used to be a boolean threaded separately
 * through every call site (#134/#136): the blur handler and the validity
 * check could — and did — desync, since the sheet defaults to a direction
 * whose call site nobody had updated. Two call sites now import a named
 * adapter instead of deciding the flag themselves.
 */
export interface AmountField {
  sanitize(raw: string): string;
  resolve(raw: string): AmountBlurResult;
  validate(raw: string): FormulaResult;
}

function amountField(allowNegative: boolean): AmountField {
  return {
    sanitize: sanitizeAmountInput,
    resolve: (raw: string) => resolveAmountOnBlur(raw, allowNegative),
    validate: (raw: string) => evaluateAmountInput(raw, allowNegative),
  };
}

/** Manual entry amounts (Add/Edit Entry, either direction) — any sign, including zero. See ADR-0005. */
export const entryAmount: AmountField = amountField(true);

/** Fund Redistribution "Amount to move" — must be strictly positive. See ADR-0005. */
export const redistributionAmount: AmountField = amountField(false);
