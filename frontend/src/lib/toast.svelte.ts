import { isQueueable } from './api';

let msg = $state<string | null>(null);
let action = $state<{ label: string; run: () => void } | null>(null);
let isConnection = $state(false);
let variant = $state<'default' | 'destructive'>('default');

function show(
  msgOrErr: unknown,
  actionArg?: { label: string; run: () => void },
  variantArg: 'default' | 'destructive' = 'default',
): void {
  msg = msgOrErr instanceof Error ? msgOrErr.message : String(msgOrErr);
  action = actionArg ?? null;
  isConnection = isQueueable(msgOrErr);
  variant = variantArg;
  // Destructive (auth) toasts stay until dismissed — they require user action.
  if (!actionArg && variantArg !== 'destructive') {
    setTimeout(() => { msg = null; isConnection = false; variant = 'default'; }, 3000);
  }
}

function dismiss(): void {
  msg = null;
  action = null;
  isConnection = false;
  variant = 'default';
}

export const toast = {
  get msg() { return msg; },
  get action() { return action; },
  get isConnection() { return isConnection; },
  get variant() { return variant; },
  show,
  dismiss,
};
