import type { AddEntryPayload, CategoryMap, Direction } from "./types";
import { entryAmount } from "./amountField";
import { isValidTag } from "./domain";

/** Sentinel description for all-but-first legs of a Split Entry. Detection is purely by this constant — see CONTEXT.md. */
export const DITTO_DESCRIPTION = '^^';

/** True when a description marks a non-first Split Entry leg. Looser than equality:
 *  any description that starts with the ditto marker counts. */
export function isDitto(description: string): boolean {
  return description.startsWith(DITTO_DESCRIPTION);
}

export interface Leg {
  tag: string;
  amount: string;
  /** Set when the amount field contains a formula that failed to evaluate. */
  error?: string;
}

export interface SplitState {
  legs: Leg[];
}

export function initSplitState(): SplitState {
  return { legs: [{ tag: "", amount: "" }] };
}

export function addLeg(state: SplitState): SplitState {
  return { legs: [...state.legs, { tag: "", amount: "" }] };
}

export function removeLeg(state: SplitState, index: number): SplitState {
  if (state.legs.length <= 1) return state;
  return { legs: state.legs.filter((_, i) => i !== index) };
}

export function updateLeg(state: SplitState, index: number, patch: Partial<Leg>): SplitState {
  return {
    legs: state.legs.map((leg, i) => (i === index ? { ...leg, ...patch } : leg)),
  };
}

export type LegValidity = { ok: true } | { ok: false; reason: string };

/**
 * Validates one Leg, returning *why* it fails so the UI can explain a disabled
 * Save button instead of just greying it out (the original #136 complaint).
 * Checks in order, first failure wins: tag present -> tag valid for direction
 * (delegates to isValidTag, which is pinned to the GAS backend's
 * checkTagDirection by parity.test.ts -- never reimplemented here) -> no
 * pending formula error -> amount acceptable under the entryAmount policy.
 */
export function validateLeg(leg: Leg, direction: Direction, categories: CategoryMap): LegValidity {
  if (leg.tag.trim() === "") return { ok: false, reason: "Pick a tag" };
  if (!isValidTag(leg.tag, direction, categories)) {
    return {
      ok: false,
      reason: direction === 'I' ? "Tag must be a Category" : "Tag must be a Subcategory or Category",
    };
  }
  if (leg.error) return { ok: false, reason: leg.error };
  if (leg.amount.trim() === "") return { ok: false, reason: "Enter an amount" };
  const amount = entryAmount.validate(leg.amount);
  if ('error' in amount) return { ok: false, reason: amount.error };
  return { ok: true };
}

/** Validates every Leg in a split; returns the first failing Leg's reason. */
export function validateSplit(state: SplitState, direction: Direction, categories: CategoryMap): LegValidity {
  for (const leg of state.legs) {
    const result = validateLeg(leg, direction, categories);
    if (!result.ok) return result;
  }
  return { ok: true };
}

export function toAddEntryPayloads(
  state: SplitState,
  shared: { date: string; description: string; direction: Direction }
): AddEntryPayload[] {
  return state.legs.map((leg, i) => ({
    date: shared.date,
    tag: leg.tag,
    description: i === 0 ? shared.description : DITTO_DESCRIPTION,
    direction: shared.direction,
    amount: parseFloat(leg.amount),
  }));
}
