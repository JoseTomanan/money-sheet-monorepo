import type { AddEntryPayload, Direction } from "./types";
import { evaluateAmountInput } from "./formula";

/** Sentinel description for all-but-first legs of a Split Entry. Detection is purely by this constant — see CONTEXT.md. */
export const DITTO_DESCRIPTION = '^^';

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
  return { legs: [{ tag: "", amount: "" }, { tag: "", amount: "" }] };
}

export function addLeg(state: SplitState): SplitState {
  return { legs: [...state.legs, { tag: "", amount: "" }] };
}

export function removeLeg(state: SplitState, index: number): SplitState {
  if (state.legs.length <= 2) return state;
  return { legs: state.legs.filter((_, i) => i !== index) };
}

export function updateLeg(state: SplitState, index: number, patch: Partial<Leg>): SplitState {
  return {
    legs: state.legs.map((leg, i) => (i === index ? { ...leg, ...patch } : leg)),
  };
}

export function isSplitValid(state: SplitState): boolean {
  return state.legs.every(
    (leg) => leg.tag.trim() !== "" && !leg.error && !('error' in evaluateAmountInput(leg.amount))
  );
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
