<script lang="ts">
  interface Props {
    children?: import('svelte').Snippet;
    right?: import('svelte').Snippet;
  }

  let { children, right }: Props = $props();
</script>

<div class="section-header flex items-center justify-between px-5 pt-[14px] pb-2 font-sans text-[11px] font-semibold tracking-[0.8px] uppercase text-muted-foreground">
  <span class="label">{@render children?.()}</span>
  {#if right}
    <span class="right normal-case tracking-normal text-[13px] font-medium text-accent">{@render right()}</span>
  {/if}
</div>
