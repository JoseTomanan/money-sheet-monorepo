<script lang="ts">
  import { cn } from '$lib/utils';

  type Variant = 'default' | 'destructive';

  interface Action {
    label: string;
    run: () => void;
  }

  interface Props {
    message: string;
    variant?: Variant;
    isConnection?: boolean;
    action?: Action | null;
    onSettings?: () => void;
    onDismiss: () => void;
    class?: string;
  }

  let {
    message,
    variant = 'default',
    isConnection = false,
    action = null,
    onSettings,
    onDismiss,
    class: cls = '',
  }: Props = $props();

  const base =
    'flex items-start gap-3 py-3 px-4 rounded-[var(--radius-md)] font-sans text-[13px] font-medium z-[300] animate-[toast-in_200ms_ease-out]';

  const variants: Record<Variant, string> = {
    default:
      'bg-foreground text-background shadow-[0_4px_24px_rgba(0,0,0,0.18)]',
    destructive:
      'bg-[rgba(193,74,50,0.07)] text-foreground border border-[rgba(193,74,50,0.22)] border-l-[3px] border-l-destructive shadow-[0_4px_24px_rgba(193,74,50,0.12)]',
  };

  const isDestructive = $derived(variant === 'destructive');
</script>

<div
  class={cn(base, variants[variant], cls)}
  role="alert"
  aria-live="assertive"
  aria-atomic="true"
>
  {#if isDestructive}
    <!-- lock icon -->
    <svg
      class="shrink-0 mt-[1px] text-destructive"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  {/if}

  <span class="flex-1 leading-snug">{message}</span>

  {#if isConnection && onSettings}
    <button
      class={cn(
        'shrink-0 cursor-pointer border-0 p-0 text-[13px] font-semibold underline underline-offset-2 bg-transparent',
        isDestructive ? 'text-destructive' : 'text-background',
      )}
      onclick={onSettings}
    >Check Settings</button>
  {/if}

  {#if action}
    <button
      class={cn(
        'shrink-0 cursor-pointer border-0 p-0 text-[13px] font-semibold underline underline-offset-2 bg-transparent',
        isDestructive ? 'text-destructive' : 'text-background',
      )}
      onclick={action.run}
    >{action.label}</button>
  {/if}

  <button
    class={cn(
      'shrink-0 cursor-pointer border-0 p-0 leading-none bg-transparent opacity-50 hover:opacity-80 transition-opacity duration-150',
      isDestructive ? 'text-foreground' : 'text-background',
    )}
    aria-label="Dismiss"
    onclick={onDismiss}
  >×</button>
</div>
