/** Pointer-only visual feedback; activation remains owned by the button's click handler. */
export function pressFeedback(node: HTMLButtonElement) {
  let pointer: number | null = null;

  function clear() {
    pointer = null;
    delete node.dataset.pressed;
  }
  function down(event: PointerEvent) {
    if (node.disabled || !event.isPrimary || event.button !== 0) return;
    pointer = event.pointerId;
    node.dataset.pressed = '';
  }
  function move(event: PointerEvent) {
    if (event.pointerId !== pointer) return;
    const rect = node.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) clear();
  }
  function end(event: PointerEvent) {
    if (event.pointerId === pointer) clear();
  }

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerleave', end);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
  window.addEventListener('blur', clear);
  return { destroy() {
    clear();
    node.removeEventListener('pointerdown', down);
    node.removeEventListener('pointermove', move);
    node.removeEventListener('pointerleave', end);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    window.removeEventListener('blur', clear);
  } };
}
