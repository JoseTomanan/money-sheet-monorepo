export type Snap = 'default' | 'expanded';

export interface DragState {
  startY: number;
  startSnap: Snap;
  offsetY: number;
  lastY: number;
  lastT: number;
  velocity: number; // px/ms, positive = downward
}

export type EndResult = { action: 'dismiss' } | { action: 'snap'; to: Snap };

export function startDrag(startY: number, startSnap: Snap, now: number = Date.now()): DragState {
  return { startY, startSnap, offsetY: 0, lastY: startY, lastT: now, velocity: 0 };
}

export function moveDrag(state: DragState, currentY: number, now: number = Date.now()): DragState {
  const dt = now - state.lastT;
  const velocity = dt > 0 ? (currentY - state.lastY) / dt : state.velocity;
  return { ...state, offsetY: currentY - state.startY, lastY: currentY, lastT: now, velocity };
}

export function endDrag(
  state: DragState,
  thresholds: { dismissPx?: number; switchPx?: number; flickVelocity?: number } = {}
): EndResult {
  const dismissPx = thresholds.dismissPx ?? 80;
  const switchPx = thresholds.switchPx ?? 60;
  const flickVelocity = thresholds.flickVelocity ?? 0.5;
  const { offsetY, startSnap, velocity } = state;

  if (startSnap === 'default') {
    if (velocity > flickVelocity || offsetY > dismissPx) return { action: 'dismiss' };
    if (velocity < -flickVelocity || offsetY < -switchPx) return { action: 'snap', to: 'expanded' };
    return { action: 'snap', to: 'default' };
  } else {
    if (velocity > flickVelocity || offsetY > dismissPx + switchPx) return { action: 'dismiss' };
    if (offsetY > switchPx) return { action: 'snap', to: 'default' };
    return { action: 'snap', to: 'expanded' };
  }
}
