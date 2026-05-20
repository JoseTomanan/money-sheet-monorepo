<script lang="ts">
  interface Props {
    children?: import('svelte').Snippet;
    right?: import('svelte').Snippet;
  }

  let { children, right }: Props = $props();
</script>

<div class="section-header">
  <span class="label">{@render children?.()}</span>
  {#if right}
    <span class="right">{@render right()}</span>
  {/if}
</div>

<style>
  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px 8px;
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: var(--muted-foreground);
  }
  .right {
    text-transform: none;
    letter-spacing: 0;
    font-size: 13px;
    font-weight: 500;
    color: var(--accent);
  }
</style>
