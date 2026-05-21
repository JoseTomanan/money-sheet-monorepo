import type { AddEntryPayload } from "./types";

export interface Leg {
  tag: string;
  amount: string;
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
    (leg) => leg.tag.trim() !== "" && parseFloat(leg.amount) > 0
  );
}

export function toAddEntryPayloads(
  state: SplitState,
  shared: { date: string; description: string }
): AddEntryPayload[] {
  return state.legs.map((leg) => ({
    date: shared.date,
    tag: leg.tag,
    description: shared.description,
    direction: "I" as const,
    amount: parseFloat(leg.amount),
  }));
}
