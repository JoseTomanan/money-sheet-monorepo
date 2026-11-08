/** One Tab stop per choice group. Arrows move focus; native buttons own activation. */
export function choiceGroup(node: HTMLElement) {
  const buttons = () => [...node.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  function sync(preferred?: HTMLButtonElement) {
    const choices = buttons();
    const current = preferred ?? choices.find(button => button.tabIndex === 0)
      ?? choices.find(button => button.getAttribute('aria-pressed') === 'true') ?? choices[0];
    for (const button of choices) button.tabIndex = button === current ? 0 : -1;
  }
  function focus(event: FocusEvent) {
    if (event.target instanceof HTMLButtonElement) sync(event.target);
  }
  function keydown(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const choices = buttons();
    const index = choices.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    choices[(index + (event.key === 'ArrowRight' ? 1 : -1) + choices.length) % choices.length].focus();
  }
  sync();
  const observer = new MutationObserver(() => sync());
  observer.observe(node, { childList: true, subtree: true });
  node.addEventListener('focusin', focus);
  node.addEventListener('keydown', keydown);
  return { destroy() {
    observer.disconnect();
    node.removeEventListener('focusin', focus);
    node.removeEventListener('keydown', keydown);
  } };
}
