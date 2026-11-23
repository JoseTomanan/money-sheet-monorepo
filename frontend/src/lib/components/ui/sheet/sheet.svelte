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
    entryMotion?: boolean;
    onInteractOutside?: (event: PointerEvent) => void;
    onkeydown?: (event: KeyboardEvent) => void;
    initialFocus?: string;
    fallbackFocus?: () => HTMLElement | null;
    previewPull?: number;
  }

  let {
    open, onOpenChange, children, class: cls = '', contentStyle, onkeydown, initialFocus, fallbackFocus,
    content = $bindable(null), overlay = $bindable(null), managedMotion = false, entryMotion = false, onInteractOutside, previewPull = 0,
  }: Props = $props();
  let opener: HTMLElement | null = null;
  let previewNode = $state<HTMLDivElement | null>(null);
</script>

<Dialog.Root {open} {onOpenChange}>
{#if previewPull > 0 && !open}
  <div data-entry-preview-backdrop aria-hidden="true" inert class="fixed inset-0 z-[200] bg-[var(--overlay-bg)] pointer-events-none" style:opacity={Math.min(1, previewPull / (previewNode?.offsetHeight || 500))}></div>
  <div bind:this={previewNode} data-entry-preview aria-hidden="true" inert class={cn('sheet fixed bottom-0 inset-x-0 mx-auto z-[200] w-full max-w-[var(--app-max-width)] max-h-[90dvh] overflow-hidden bg-background rounded-tl-[28px] rounded-tr-[28px] shadow-[var(--shadow-sheet)] pointer-events-none', cls)} style:transform={`translateY(max(0px, calc(100% - ${previewPull}px)))`}>
    {@render children()}
  </div>
{/if}
  <Dialog.Portal>
    <Dialog.Overlay
      bind:ref={overlay}
      data-entry-overlay-motion={managedMotion ? entryMotion : undefined}
      class={cn('fixed inset-0 z-[200] bg-[var(--overlay-bg)]', !managedMotion &&
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:data-[state=open]:[animation-name:sheet-fade-in] motion-reduce:data-[state=closed]:[animation-name:sheet-fade-out] motion-reduce:data-[state=open]:[animation-duration:80ms] motion-reduce:data-[state=closed]:[animation-duration:80ms] motion-reduce:data-[state=open]:[animation-timing-function:var(--ease-out)] motion-reduce:data-[state=closed]:[animation-timing-function:var(--ease-out)]',
        managedMotion && 'data-[state=closed]:pointer-events-none')}
    />
    <Dialog.Content
      onEscapeKeydown={guardEscape}
      {onInteractOutside}
      data-entry-sheet-motion={managedMotion ? entryMotion : undefined}
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
        'sheet fixed bottom-0 inset-x-0 mx-auto z-[200] w-full max-w-[var(--app-max-width)] max-h-[90dvh] overflow-y-auto overflow-x-clip bg-sheet rounded-tl-[28px] rounded-tr-[28px] shadow-[var(--shadow-sheet)] pb-8',
        !managedMotion && 'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom data-[state=closed]:[animation-duration:280ms] motion-reduce:data-[state=open]:[animation-name:sheet-fade-in] motion-reduce:data-[state=closed]:[animation-name:sheet-fade-out] motion-reduce:data-[state=open]:[animation-duration:80ms] motion-reduce:data-[state=closed]:[animation-duration:80ms] motion-reduce:data-[state=open]:[animation-timing-function:var(--ease-out)] motion-reduce:data-[state=closed]:[animation-timing-function:var(--ease-out)]',
        managedMotion && 'data-[state=closed]:pointer-events-none',
        cls
      )}
      style={contentStyle}
    >
      {@render children()}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
