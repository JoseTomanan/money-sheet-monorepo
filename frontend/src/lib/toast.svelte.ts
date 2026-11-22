import { isQueueable } from './api';

let owner: symbol | null = null;
let msg = $state<string | null>(null);
let action = $state<{ label: string; run: () => void } | null>(null);
let isConnection = $state(false);
let variant = $state<'default' | 'destructive'>('default');
let errorNotification = $state(false);
export interface ToastPresentation {
  heading: string;
  isConnection?: boolean;
}
let presentation = $state<ToastPresentation | null>(null);
let exiting = $state<{ message: string; heading?: string; actionLabel?: string; isError: boolean; isConnection: boolean } | null>(null);
let exitTimer: ReturnType<typeof setTimeout> | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
export type ToastPauseReason = 'hover' | 'focus' | 'hidden';
const pauses = new Set<ToastPauseReason>();
let remaining = 0;
let startedAt = 0;

function cancelTimer(): void {
  clearTimeout(timer);
  timer = undefined;
}

function schedule(): void {
  if (msg === null || pauses.size > 0) return;
  startedAt = Date.now();
  timer = setTimeout(expire, remaining);
}

function clearExit(): void {
  clearTimeout(exitTimer);
  exiting = null;
}

function expire(): void {
  if (msg === null) return;
  const snapshot = { message: msg, heading: presentation?.heading, actionLabel: action?.label, isError: errorNotification || isConnection || variant === 'destructive', isConnection };
  dismiss();
  exiting = snapshot;
  exitTimer = setTimeout(clearExit, typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches ? 80 : 140);
}

function pause(reason: ToastPauseReason): void {
  if (pauses.has(reason)) return;
  if (timer !== undefined) {
    remaining = Math.max(0, remaining - (Date.now() - startedAt));
    cancelTimer();
  }
  pauses.add(reason);
}

function resume(reason: ToastPauseReason): void {
  if (pauses.delete(reason) && pauses.size === 0) schedule();
}

function show(
  msgOrErr: unknown,
  actionArg?: { label: string; run: () => void },
  variantArg: 'default' | 'destructive' = 'default',
  presentationArg?: ToastPresentation,
): void {
  clearExit();
  owner = null;
  cancelTimer();
  msg = msgOrErr instanceof Error ? msgOrErr.message : String(msgOrErr);
  action = actionArg ?? null;
  isConnection = presentationArg?.isConnection ?? isQueueable(msgOrErr);
  variant = variantArg;
  errorNotification = msgOrErr instanceof Error;
  presentation = presentationArg ?? null;
  remaining = actionArg || isConnection || variantArg === 'destructive' ? 8000 : 3000;
  schedule();
}

function dismiss(): void {
  clearExit();
  owner = null;
  cancelTimer();
  msg = null;
  action = null;
  isConnection = false;
  variant = 'default';
  errorNotification = false;
  presentation = null;
  remaining = 0;
}

export const toast = {
  get exiting() { return exiting; },
  get msg() { return msg; },
  get action() { return action; },
  get isConnection() { return isConnection; },
  get isError() { return errorNotification || isConnection || variant === 'destructive'; },
  get variant() { return variant; },
  get presentation() { return presentation; },
  show,
  showOwned(key: symbol, message: string, actionArg?: { label: string; run: () => void }): boolean {
    if (msg !== null && (errorNotification || isConnection || variant === 'destructive')) return false;
    show(message, actionArg);
    owner = key;
    return true;
  },
  updateOwned(key: symbol, message: string, actionArg?: { label: string; run: () => void }): void {
    if (owner !== key || msg === null) return;
    // Updating a phase does not restart expiry or disturb focus/hover pauses.
    msg = message;
    action = actionArg ?? null;
  },
  dismissOwned(key: symbol): void { if (owner === key) dismiss(); },
  dismiss,
  pause,
  resume,
};
