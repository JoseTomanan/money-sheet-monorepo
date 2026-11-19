const INTENT_PX = 8;
const UPWARD_RESISTANCE = 0.18;
const VELOCITY_WINDOW_MS = 100;
const MIN_FLICK_TRAVEL = 32;
const FLICK_SPEED = 0.55; // CSS px per millisecond

type Sample = { y: number; time: number };
type Drag = {
  id: number; x: number; y: number; origin: number; vertical: boolean; samples: Sample[];
};

export function createAddEntrySwipe(
  nodes: () => { sheet: HTMLDivElement | null; backdrop: HTMLDivElement | null },
  close: () => void,
) {
  let drag: Drag | undefined;
  let position = 0;
  let height = 1;
  let frame = 0;

  function paint(y: number) {
    const { sheet, backdrop } = nodes();
    position = y;
    if (sheet) sheet.style.transform = y === 0 ? '' : `translateY(${y}px)`;
    if (backdrop) backdrop.style.opacity = y <= 0 ? '' : String(Math.max(0, 1 - y / height));
  }

  function stop() {
    cancelAnimationFrame(frame);
    drag = undefined;
  }

  function reset() {
    stop();
    paint(0);
  }

  function settle(dismiss = false, velocity = 0) {
    const from = position;
    const to = dismiss ? height : 0;
    if (from === to) {
      if (dismiss) close();
      return;
    }
    const start = performance.now();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduced ? 65 : dismiss ? 300 : 190;
    // Ease the release from the finger's speed, limiting the slope to avoid overshoot.
    const slope = Math.min(3, Math.max(0, velocity * duration / (to - from)));
    function step(now: number) {
      const progress = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = reduced ? progress
        : dismiss ? progress ** 2 * (3 - 2 * progress) + slope * progress * (1 - progress) ** 2
        : 1 - (1 - progress) ** 3;
      paint(from + (to - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(step);
      else if (dismiss) close();
    }
    frame = requestAnimationFrame(step);
  }

  function start(event: PointerEvent) {
    const { sheet } = nodes();
    if (!sheet || drag || !event.isPrimary || event.button !== 0 ||
      (event.target as Element).closest('button, input, a, select, textarea, [contenteditable], [role="button"]')) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    cancelAnimationFrame(frame);
    height = sheet.getBoundingClientRect().height || 1;
    drag = {
      id: event.pointerId, x: event.clientX, y: event.clientY, origin: position,
      vertical: false, samples: [{ y: event.clientY, time: event.timeStamp }],
    };
  }

  function move(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.vertical) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < INTENT_PX) return;
      if (Math.abs(dy) <= Math.abs(dx)) {
        drag = undefined;
        settle();
        return;
      }
      drag.vertical = true;
    }
    drag.samples.push({ y: event.clientY, time: event.timeStamp });
    while (drag.samples.length > 2 && event.timeStamp - drag.samples[1].time > VELOCITY_WINDOW_MS) {
      drag.samples.shift();
    }
    const y = drag.origin + dy;
    paint(y < 0 ? y * UPWARD_RESISTANCE / (1 - y / 110) : Math.min(height, y));
  }

  function release(event: PointerEvent) {
    if (!drag || drag.id !== event.pointerId) return;
    const last = drag.samples.at(-1)!;
    const previous = drag.samples.at(-2);
    const first = drag.samples.find(sample => event.timeStamp - sample.time <= VELOCITY_WINDOW_MS) ?? last;
    const velocity = (last.y - first.y) / Math.max(1, event.timeStamp - first.time);
    const flick = previous && last.y > previous.y && position >= MIN_FLICK_TRAVEL && velocity >= FLICK_SPEED;
    const distance = Math.min(120, Math.max(72, height * 0.25));
    const reversedClose = drag.origin > 0 && last.y - drag.y <= -INTENT_PX;
    const dismiss = drag.vertical && !reversedClose && (position >= distance || !!flick);
    drag = undefined;
    settle(dismiss, velocity);
  }

  function cancel(event: PointerEvent) {
    if (drag?.id !== event.pointerId) return;
    drag = undefined;
    settle();
  }

  return { start, move, release, cancel, stop, reset };
}
