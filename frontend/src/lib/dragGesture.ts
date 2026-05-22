export type Snap = 'default' | 'expanded';

export interface DragState {
  startY: number;
  startSnap: Snap;
  offsetY: number;
}

export type EndResult = { action: 'dismiss' } | { action: 'snap'; to: Snap };

export function startDrag(startY: number, startSnap: Snap): DragState {
  return { startY, startSnap, offsetY: 0 };
}

export function moveDrag(state: DragState, currentY: number): DragState {
  return { ...state, offsetY: currentY - state.startY };
}

export function endDrag(
  state: DragState,
  thresholds: { dismissPx?: number; switchPx?: number } = {}
): EndResult {
  const dismissPx = thresholds.dismissPx ?? 80;
  const switchPx = thresholds.switchPx ?? 60;
  const { offsetY, startSnap } = state;

  if (startSnap === 'default') {
    if (offsetY > dismissPx) return { action: 'dismiss' };
    if (offsetY < -switchPx) return { action: 'snap', to: 'expanded' };
    return { action: 'snap', to: 'default' };
  } else {
    if (offsetY > dismissPx + switchPx) return { action: 'dismiss' };
    if (offsetY > switchPx) return { action: 'snap', to: 'default' };
    return { action: 'snap', to: 'expanded' };
  }
}
