import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installPageShortcuts, primaryModifier } from './keyboard';

let dispose: () => void;
let characters = true;
let context = 'home';
const add = vi.fn();
const navigate = vi.fn();
const commandMenu = vi.fn();
const key = (value: string, init: KeyboardEventInit = {}, target: EventTarget = window) => {
  const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};
beforeEach(() => {
  vi.useFakeTimers();
  characters = true; context = 'home'; add.mockClear(); navigate.mockClear(); commandMenu.mockClear();
  dispose = installPageShortcuts({ context: () => context, available: () => context !== 'gate', canAdd: () => true, charactersEnabled: () => characters, add, navigate, commandMenu });
});
afterEach(() => { dispose(); document.body.replaceChildren(); vi.restoreAllMocks(); vi.useRealTimers(); });

it.each(['Win32', 'Linux x86_64', 'MacIntel'])('uses the platform save/select-all modifier on %s', platform => {
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
  expect(primaryModifier(new KeyboardEvent('keydown', { ctrlKey: true }))).toBe(platform !== 'MacIntel');
  expect(primaryModifier(new KeyboardEvent('keydown', { metaKey: true }))).toBe(platform === 'MacIntel');
  expect(primaryModifier(new KeyboardEvent('keydown', { ctrlKey: true, metaKey: true }))).toBe(false);
});

it.each(['input', 'textarea', 'select', 'contenteditable'])('leaves typing and text selection in %s alone', kind => {
  const control = document.createElement(kind === 'contenteditable' ? 'div' : kind);
  if (kind === 'contenteditable') control.setAttribute('contenteditable', 'true');
  const child = kind === 'contenteditable' ? control.appendChild(document.createElement('span')) : control;
  document.body.append(control);
  expect(key('N', { shiftKey: true }, child).defaultPrevented).toBe(false);
  expect(key('a', { ctrlKey: true }, child).defaultPrevented).toBe(false);
  key('g', {}, child); key('s', {}, child);
  expect(add).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
});

it.each(['timeout', 'focus', 'context', 'overlay', 'unrelated', 'composition'])('cancels G sequences on %s', async reason => {
  key('g');
  if (reason === 'timeout') vi.advanceTimersByTime(1000);
  if (reason === 'focus') window.dispatchEvent(new Event('focusin'));
  if (reason === 'context') context = 'entries';
  if (reason === 'unrelated') key('x');
  if (reason === 'composition') { window.dispatchEvent(new Event('compositionstart')); window.dispatchEvent(new Event('compositionend')); }
  if (reason === 'overlay') {
    const overlay = document.createElement('div');
    overlay.setAttribute('data-dialog-content', ''); overlay.dataset.state = 'open'; document.body.append(overlay);
    await Promise.resolve(); overlay.remove();
  }
  key('s');
  expect(navigate).not.toHaveBeenCalled();
});

it('preserves reserved browser shortcuts and suppresses composition, repetition, and disabled characters', () => {
  for (const value of ['n', '1', '2', '3', 'Tab']) expect(key(value, { ctrlKey: true }).defaultPrevented).toBe(false);
  key('N', { shiftKey: true, repeat: true });
  key('N', { shiftKey: true, isComposing: true });
  window.dispatchEvent(new Event('compositionstart')); key('N', { shiftKey: true }); window.dispatchEvent(new Event('compositionend'));
  characters = false;
  key('N', { shiftKey: true }); key('g'); key('s');
  expect(add).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
});

it.each(['Win32', 'Linux x86_64', 'MacIntel'])('opens commands only for the eligible platform binding on %s, independent of character preferences', platform => {
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue(platform);
  const primary = platform === 'MacIntel' ? { metaKey: true } : { ctrlKey: true };
  const wrong = platform === 'MacIntel' ? { ctrlKey: true } : { metaKey: true };
  characters = false;
  expect(key('k', primary).defaultPrevented).toBe(true);
  expect(commandMenu).toHaveBeenCalledTimes(1);
  for (const modifiers of [wrong, { ...primary, shiftKey: true }, { ...primary, altKey: true }, { ...primary, repeat: true }, { ...primary, isComposing: true }, { ctrlKey: true, metaKey: true }]) {
    expect(key('k', modifiers).defaultPrevented).toBe(false);
  }
  context = 'gate';
  expect(key('k', primary).defaultPrevented).toBe(false);
  expect(commandMenu).toHaveBeenCalledTimes(1);
});

it('does not intercept commands while typing, composing, or using an overlay and cancels pending G on opening', () => {
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
  for (const tag of ['input', 'textarea', 'select', 'div']) {
    const control = document.createElement(tag);
    if (tag === 'div') control.setAttribute('contenteditable', 'true');
    document.body.append(control);
    expect(key('k', { ctrlKey: true }, control).defaultPrevented).toBe(false);
  }
  window.dispatchEvent(new Event('compositionstart'));
  expect(key('k', { ctrlKey: true }).defaultPrevented).toBe(false);
  window.dispatchEvent(new Event('compositionend'));
  const overlay = document.createElement('div');
  overlay.setAttribute('data-dialog-content', ''); overlay.dataset.state = 'open'; document.body.append(overlay);
  expect(key('k', { ctrlKey: true }).defaultPrevented).toBe(false);
  overlay.remove();
  expect(commandMenu).not.toHaveBeenCalled();
  key('g'); key('k', { ctrlKey: true }); key('s');
  expect(commandMenu).toHaveBeenCalledTimes(1);
  expect(navigate).not.toHaveBeenCalled();
});
