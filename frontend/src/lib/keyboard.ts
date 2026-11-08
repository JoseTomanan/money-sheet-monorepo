/** Platform and interaction boundaries shared by sheet and page shortcuts. */
export type KeyboardContext = 'home' | 'entries' | 'bulk' | 'summary' | 'statistics' | 'entry' | 'settings';
export const KEYBOARD_CONTEXT = Symbol('keyboard context');
export function isMac() {
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
}

export function primaryModifier(event: KeyboardEvent) {
  return (isMac() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) && !event.altKey;
}

export function openOverlays() {
  return [...document.querySelectorAll<HTMLElement>('[data-dialog-content][data-state="open"], [data-popover-content][data-state="open"], [role="alertdialog"]')];
}

export function ownsKeyboard(element: HTMLElement) {
  return openOverlays().at(-1) === element;
}

export function guardEscape(event: KeyboardEvent) {
  if (event.repeat || event.isComposing || event.keyCode === 229) event.preventDefault();
}

export function isEditable(target: EventTarget | null) {
  return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
}

export function pageKeyboardAvailable(event: KeyboardEvent) {
  return !event.defaultPrevented && !event.isComposing && event.keyCode !== 229 && !isEditable(event.target) && openOverlays().length === 0;
}

/** Page commands delegate to existing actions; no mutation or routing ownership. */
export function installPageShortcuts(actions: {
  context: () => string;
  available: () => boolean;
  canAdd: () => boolean;
  charactersEnabled: () => boolean;
  add: () => void;
  navigate: (tab: 'home' | 'entries' | 'summary') => void;
  commandMenu?: () => void;
}) {
  let pending: { until: number; context: string } | null = null;
  let composing = false;
  const reset = () => { pending = null; };
  function keydown(event: KeyboardEvent) {
    if (actions.available() && !composing && pageKeyboardAvailable(event) && !event.repeat && !event.shiftKey && primaryModifier(event) && event.key.toLowerCase() === 'k' && actions.commandMenu) {
      reset();
      event.preventDefault();
      actions.commandMenu();
      return;
    }
    if (!actions.available() || !actions.charactersEnabled() || composing || !pageKeyboardAvailable(event) || event.repeat || event.altKey || event.ctrlKey || event.metaKey) { reset(); return; }
    const sequence = pending;
    reset();
    if (sequence && !event.shiftKey && Date.now() < sequence.until && sequence.context === actions.context()) {
      const destination = ({ h: 'home', e: 'entries', s: 'summary' } as const)[event.key.toLowerCase()];
      if (destination) { event.preventDefault(); actions.navigate(destination); return; }
    }
    if (event.shiftKey && event.key.toLowerCase() === 'n' && actions.canAdd()) {
      event.preventDefault();
      actions.add();
    } else if (event.key.toLowerCase() === 'g' && !event.shiftKey) {
      pending = { until: Date.now() + 1000, context: actions.context() };
    }
  }
  const startComposition = () => { composing = true; reset(); };
  const endComposition = () => { composing = false; reset(); };
  const observer = new MutationObserver(() => { if (openOverlays().length) reset(); });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });
  window.addEventListener('keydown', keydown);
  window.addEventListener('focusin', reset);
  window.addEventListener('pointerdown', reset);
  window.addEventListener('blur', reset);
  window.addEventListener('compositionstart', startComposition);
  window.addEventListener('compositionend', endComposition);
  return () => {
    observer.disconnect();
    window.removeEventListener('keydown', keydown);
    window.removeEventListener('focusin', reset);
    window.removeEventListener('pointerdown', reset);
    window.removeEventListener('blur', reset);
    window.removeEventListener('compositionstart', startComposition);
    window.removeEventListener('compositionend', endComposition);
  };
}
