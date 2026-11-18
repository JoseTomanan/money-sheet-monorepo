<script lang="ts">
  interface Props {
    children?: import('svelte').Snippet;
    right?: import('svelte').Snippet;
    flush?: boolean;
  }

  let { children, right, flush = false }: Props = $props();
</script>

<div class="section-header flex flex-wrap items-center justify-between gap-x-3 font-sans text-sm font-semibold text-foreground {flush ? '' : 'px-5 pt-4 pb-2'}">
  <div class="label">{@render children?.()}</div>
  {#if right}
    <div class="right normal-case tracking-normal text-[13px] font-medium text-accent">{@render right()}</div>
  {/if}
</div>
