import { checkTagDirection, type CategoryMap } from "./category";
import { isValidCalendarDate } from "./calendar";

export type Direction = "I" | "O";

export interface Entry {
  id: number;
  date: string;
  tag: string;
  mainCategory: string;
  description: string;
  direction: Direction;
  amount: number;
  /** Persistent source order used for display; absent until persisted. */
  row?: number;
}

export interface EntryFacts {
  date: string;
  tag: string;
  direction: Direction;
  amount: number;
}

export function amountInvariantViolation(
  amount: number,
  reportedValue: unknown = amount,
): string | null {
  return isFinite(amount)
    ? null
    : `"amount" must be a finite number, got: ${JSON.stringify(reportedValue)}`;
}

export function entryInvariantViolation(
  entry: EntryFacts,
  categories: CategoryMap,
): string | null {
  if (!isValidCalendarDate(entry.date)) {
    return `"date" must be a valid ISO date string (YYYY-MM-DD), got: ${JSON.stringify(entry.date)}`;
  }
  const amountViolation = amountInvariantViolation(entry.amount);
  if (amountViolation) return amountViolation;
  return checkTagDirection(entry.tag, entry.direction, categories);
}
