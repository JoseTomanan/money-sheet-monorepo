<script lang="ts">
  import { Dialog } from 'bits-ui';
  import type { Snippet } from 'svelte';
  import { cn } from '$lib/utils';

  interface Props {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    children: Snippet;
    class?: string;
  }

  let { open, onOpenChange, children, class: cls = '' }: Props = $props();
</script>

<Dialog.Root {open} {onOpenChange}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="fixed inset-0 z-[200] bg-[rgba(26,24,20,0.4)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <Dialog.Content
      class={cn(
        'fixed bottom-0 left-1/2 z-[200] w-full -translate-x-1/2 max-w-[var(--app-max-width)] max-h-[90dvh] overflow-y-auto bg-background rounded-tl-[28px] rounded-tr-[28px] shadow-[var(--shadow-sheet)] pb-8',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        cls
      )}
    >
      {@render children()}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
