<script lang="ts">
  import { Dialog } from 'bits-ui';
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';
  import { guardEscape } from '$lib/keyboard';

  interface Props {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    children: Snippet;
    class?: string;
    contentStyle?: string;
    content?: HTMLDivElement | null;
    overlay?: HTMLDivElement | null;
    managedMotion?: boolean;
    onkeydown?: (event: KeyboardEvent) => void;
    initialFocus?: string;
    fallbackFocus?: () => HTMLElement | null;
  }

  let {
    open, onOpenChange, children, class: cls = '', contentStyle, onkeydown, initialFocus, fallbackFocus,
    content = $bindable(null), overlay = $bindable(null), managedMotion = false,
  }: Props = $props();
  let opener: HTMLElement | null = null;
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay
      bind:ref={overlay}
      class={cn('fixed inset-0 z-[200] bg-[var(--overlay-bg)]', !managedMotion &&
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:data-[state=open]:[animation-name:sheet-fade-in] motion-reduce:data-[state=closed]:[animation-name:sheet-fade-out] motion-reduce:data-[state=open]:[animation-duration:80ms] motion-reduce:data-[state=closed]:[animation-duration:80ms] motion-reduce:data-[state=open]:[animation-timing-function:var(--ease-out)] motion-reduce:data-[state=closed]:[animation-timing-function:var(--ease-out)]')}
    />
    <Dialog.Content
      onEscapeKeydown={guardEscape}
      bind:ref={content}
      onOpenAutoFocus={(event) => {
        opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const target = initialFocus && content?.querySelector<HTMLElement>(initialFocus);
        if (target) { event.preventDefault(); target.focus(); }
      }}
      onCloseAutoFocus={(event) => {
        if (opener?.isConnected && opener !== document.body && !opener.matches(':disabled') && !opener.closest('[inert], [aria-hidden="true"]')) return;
        const target = fallbackFocus?.();
        if (target) { event.preventDefault(); target.focus(); }
      }}
      onkeydowncapture={onkeydown}
      class={cn(
        'sheet fixed bottom-0 inset-x-0 mx-auto z-[200] w-full max-w-[var(--app-max-width)] max-h-[90dvh] overflow-y-auto overflow-x-clip bg-background rounded-tl-[28px] rounded-tr-[28px] shadow-[var(--shadow-sheet)] pb-8',
        !managedMotion && 'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom data-[state=closed]:[animation-duration:280ms] motion-reduce:data-[state=open]:[animation-name:sheet-fade-in] motion-reduce:data-[state=closed]:[animation-name:sheet-fade-out] motion-reduce:data-[state=open]:[animation-duration:80ms] motion-reduce:data-[state=closed]:[animation-duration:80ms] motion-reduce:data-[state=open]:[animation-timing-function:var(--ease-out)] motion-reduce:data-[state=closed]:[animation-timing-function:var(--ease-out)]',
        cls
      )}
      style={contentStyle}
    >
      {@render children()}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
