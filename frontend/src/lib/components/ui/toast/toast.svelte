<script lang="ts">
  import { onDestroy } from 'svelte';
  import { cn } from '$lib/utils';
  import type { ToastPresentation, ToastPauseReason } from '$lib/toast.svelte';

  interface Props {
    message: string | null;
    variant?: 'default' | 'destructive';
    presentation?: ToastPresentation | null;
    isConnection?: boolean;
    isError?: boolean;
    action?: { label: string; run: () => void } | null;
    onSettings?: () => void;
    onDismiss: () => void;
    onPause?: (reason: ToastPauseReason) => void;
    onResume?: (reason: ToastPauseReason) => void;
    class?: string;
  }

  let {
    message, variant = 'default', presentation = null, isConnection = false, isError: errorNotification = false,
    action = null, onSettings, onDismiss, onPause, onResume, class: cls = '',
  }: Props = $props();

  const announcement = $derived(message ? [presentation?.heading, message].filter(Boolean).join(' ') : '');
  const isError = $derived(errorNotification || variant === 'destructive' || isConnection);
  const control = 'min-h-11 rounded-[var(--radius-sm)] px-3 font-sans text-[13px] font-semibold cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground';

  // Removing a hovered/focused card releases its interaction pauses. A content
  // replacement in the same card retains the current pause state.
  $effect(() => {
    if (message === null) {
      onResume?.('hover');
      onResume?.('focus');
    }
  });
  onDestroy(() => {
    onResume?.('hover');
    onResume?.('focus');
  });

  function handleFocusOut(event: FocusEvent) {
    const target = event.currentTarget as HTMLElement;
    if (!(event.relatedTarget instanceof Node) || !target.contains(event.relatedTarget)) onResume?.('focus');
  }
</script>

<!-- Stable announcement channels: only one receives each message.
     Visible copy and controls are outside the live regions. -->
<div class="sr-only" role="alert" aria-atomic="true">{isError ? announcement : ''}</div>
<div class="sr-only" role="status" aria-atomic="true">{isError ? '' : announcement}</div>

{#if message !== null}
  <section
    aria-label="Notification"
    class={cn('relative z-[300] pointer-events-auto rounded-[var(--radius-md)] border border-border bg-card p-4 text-foreground shadow-[var(--shadow-card)] font-sans motion-safe:animate-[toast-in_180ms_ease-out] motion-reduce:animate-none', cls)}
    onpointerenter={() => onPause?.('hover')}
    onpointerleave={() => onResume?.('hover')}
    onfocusin={() => onPause?.('focus')}
    onfocusout={handleFocusOut}
  >
    <div class="flex items-start gap-3 pr-8">
      {#if isError}
        <svg class="mt-0.5 shrink-0 text-destructive" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m10.3 3.9-8.5 14.7A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.4L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4m0 4h.01" />
        </svg>
      {/if}
      <div class="min-w-0 flex-1 [overflow-wrap:anywhere]">
        {#if presentation?.heading}
          <h2 class="m-0 mb-1 font-display text-[14px] leading-[1.45] font-semibold">{presentation.heading}</h2>
        {/if}
        <p class="m-0 text-[13px] leading-[1.45]">{message}</p>
      </div>
    </div>

    {#if action || (isConnection && onSettings)}
      <div class="mt-3 flex flex-wrap gap-2 {isError ? 'pl-[30px]' : ''}">
        {#if action}
          <button class={cn(control, 'border border-accent bg-accent/15 text-foreground hover:bg-accent/25')} onclick={action.run}>{action.label}</button>
        {/if}
        {#if isConnection && onSettings}
          <button class={cn(control, 'border border-border bg-muted text-foreground hover:bg-border')} onclick={onSettings}>Check Settings</button>
        {/if}
      </div>
    {/if}

    <button class="absolute right-1 top-1 flex size-11 items-center justify-center rounded-[var(--radius-sm)] border-0 bg-transparent text-foreground cursor-pointer hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground" aria-label="Dismiss" onclick={onDismiss}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
    </button>
  </section>
{/if}
