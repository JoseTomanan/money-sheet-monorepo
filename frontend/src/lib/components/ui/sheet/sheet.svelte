<script lang="ts">
  import { Dialog } from 'bits-ui';
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';

  interface Props {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    children: Snippet;
    class?: string;
    contentStyle?: string;
  }

  let { open, onOpenChange, children, class: cls = '', contentStyle }: Props = $props();
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-[200] bg-[var(--overlay-bg)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <Dialog.Content
      class={cn(
        'fixed bottom-0 inset-x-0 mx-auto z-[200] w-full max-w-[var(--app-max-width)] max-h-[90dvh] overflow-y-auto overflow-x-clip bg-background rounded-tl-[28px] rounded-tr-[28px] shadow-[var(--shadow-sheet)] pb-8',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom data-[state=closed]:[animation-duration:280ms]',
        cls
      )}
      style={contentStyle}
    >
      {@render children()}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
