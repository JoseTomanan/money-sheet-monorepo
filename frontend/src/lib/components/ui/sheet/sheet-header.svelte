<script lang="ts">
  import type { Snippet } from 'svelte';
  interface Props { children: Snippet }
  let { children }: Props = $props();
</script>

<div class="flex items-center justify-between px-5 pt-2 pb-[6px]">
  {@render children()}
</div>
