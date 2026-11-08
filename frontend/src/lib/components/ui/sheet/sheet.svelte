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
    onkeydown?: (event: KeyboardEvent) => void;
    initialFocus?: string;
    fallbackFocus?: () => HTMLElement | null;
  }

  let { open, onOpenChange, children, class: cls = '', contentStyle, onkeydown, initialFocus, fallbackFocus }: Props = $props();
  let content = $state<HTMLDivElement | null>(null);
  let opener: HTMLElement | null = null;
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-[200] bg-[var(--overlay-bg)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
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
        if (opener?.isConnected && opener !== document.body && !opener.matches(':disabled')) return;
        const target = fallbackFocus?.();
        if (target) { event.preventDefault(); target.focus(); }
      }}
      onkeydowncapture={onkeydown}
      class={cn(
        'sheet fixed bottom-0 inset-x-0 mx-auto z-[200] w-full max-w-[var(--app-max-width)] max-h-[90dvh] overflow-y-auto overflow-x-clip bg-background rounded-tl-[28px] rounded-tr-[28px] shadow-[var(--shadow-sheet)] pb-8',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom data-[state=closed]:[animation-duration:280ms]',
        cls
      )}
      style={contentStyle}
    >
      {@render children()}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
