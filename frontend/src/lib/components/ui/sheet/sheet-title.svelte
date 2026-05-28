<script lang="ts">
  import { Dialog } from 'bits-ui';
  import type { Snippet } from 'svelte';
  interface Props { children: Snippet }
  let { children }: Props = $props();
</script>

<Dialog.Title class="font-display text-base font-semibold text-foreground tracking-[-0.2px]">
  {@render children()}
</Dialog.Title>
