export type FormulaResult = { value: number } | { error: string };

const FORMULA_INVALID: FormulaResult = { error: "Invalid formula" };
const FORMULA_NOT_POSITIVE: FormulaResult = { error: "Amount must be positive" };

/**
 * Evaluates an amount input string and enforces positivity.
 * Accepts: plain positive numbers ("50", "3.14"), formula strings ("=10+5"),
 * and arithmetic strings with operators ("10+5", "100-30").
 * Returns { value } on success, { error } on invalid input or non-positive result.
 */
export function evaluateAmountInput(raw: string): FormulaResult {
  const trimmed = raw.trim();
  if (!trimmed) return FORMULA_INVALID;

  // Plain number (no operators, no leading =)
  if (!isFormula(trimmed) && !/[+\-]/.test(trimmed)) {
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n <= 0) return FORMULA_NOT_POSITIVE;
    return { value: n };
  }

  // Formula or arithmetic expression
  const expr = isFormula(trimmed) ? trimmed : `=${trimmed}`;
  const result = evaluateFormula(expr);
  if ('error' in result) return result;
  if (result.value <= 0) return FORMULA_NOT_POSITIVE;
  return result;
}

const FORMULA_ERROR: FormulaResult = { error: "Invalid formula" };

/** Returns true when the (trimmed) string starts with '='. */
export function isFormula(raw: string): boolean {
  return raw.trimStart().startsWith("=");
}

/**
 * Single definition of the amount-input sanitise allowlist, shared by every
 * amount field that supports bare arithmetic. A leading '=' switches to
 * formula mode and is kept verbatim; otherwise only digits, '.', and the
 * arithmetic characters are kept as the user types.
 */
export function sanitizeAmountInput(raw: string): string {
  return raw.startsWith("=") ? raw : raw.replace(/[^0-9.+\-*/()]/g, "");
}

export interface AmountBlurResult {
  /** Formatted value to write back into the field, or null to leave it as typed. */
  amount: string | null;
  /** Error message to display, or null to clear any existing error. */
  error: string | null;
}

/**
 * Resolves an amount input string on blur. A bare plain number (no operators,
 * no leading '=') is left as typed; anything with operators or a leading '='
 * is resolved via evaluateAmountInput, which enforces positivity.
 */
export function resolveAmountOnBlur(raw: string): AmountBlurResult {
  const trimmed = raw.trim();
  if (!trimmed) return { amount: null, error: null };
  if (!isFormula(trimmed) && !/[+\-*/()]/.test(trimmed)) return { amount: null, error: null };
  const result = evaluateAmountInput(raw);
  if ("error" in result) return { amount: null, error: result.error };
  return { amount: result.value.toFixed(2), error: null };
}

/**
 * Evaluates a Google Sheets-style arithmetic formula string.
 *
 * Supported: +, -, SUM(a, b, ...) with literal number arguments only.
 * No cell references, *, /, or other functions.
 * Positivity is NOT enforced here — that is the caller's responsibility.
 */
export function evaluateFormula(raw: string): FormulaResult {
  // Strip leading '=' and all whitespace.
  let expr = raw.replace(/^=/, "").replace(/\s/g, "");

  if (!expr) return FORMULA_ERROR;

  // Expand every SUM(...) call into its numeric sum.
  // Pattern: SUM( ... ) — must be balanced (no nesting beyond the outer parens).
  const sumPattern = /[sS][uU][mM]\(([^)]*)\)/g;
  let hadOpenSUM = false;

  // Detect unclosed SUM( with no matching ')'.
  if (/[sS][uU][mM]\(/.test(expr) && !/[sS][uU][mM]\([^)]*\)/.test(expr)) {
    return FORMULA_ERROR;
  }

  expr = expr.replace(sumPattern, (_, inner: string) => {
    if (!inner) { hadOpenSUM = true; return ""; }
    const parts = inner.split(",");
    let total = 0;
    for (const part of parts) {
      const n = Number(part);
      if (part === "" || !Number.isFinite(n)) { hadOpenSUM = true; return ""; }
      total += n;
    }
    return String(total);
  });

  if (hadOpenSUM) return FORMULA_ERROR;

  // After SUM expansion the expression must be a numeric +/- chain:
  // optional leading sign, then numbers separated by + or -.
  // Example valid: "15+3", "100-35", "-5" (after substitution).
  if (!/^-?\d+(\.\d+)?([+-]\d+(\.\d+)?)*$/.test(expr)) {
    return FORMULA_ERROR;
  }

  // Evaluate left-to-right. Split on + and - while keeping the sign attached.
  // Turn "100-30-20" into ["100", "-30", "-20"].
  const tokens = expr.match(/-?\d+(\.\d+)?/g);
  if (!tokens) return FORMULA_ERROR;

  const result = tokens.reduce((acc, t) => acc + Number(t), 0);
  if (!Number.isFinite(result)) return FORMULA_ERROR;

  return { value: result };
}
