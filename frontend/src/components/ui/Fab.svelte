<!-- App-specific floating action button; no direct shadcn equivalent. -->
<script lang="ts">
  interface Props {
    onclick: (event: MouseEvent) => void;
  }

  let { onclick }: Props = $props();
</script>

<button
  class="fab fixed flex items-center justify-center cursor-pointer rounded-full w-11 h-11 text-accent-foreground z-[80] bg-[var(--fab-fill)] shadow-[var(--shadow-fab)] backdrop-blur-[6px] [@media(prefers-reduced-transparency:reduce)]:bg-accent-fill [@media(prefers-reduced-transparency:reduce)]:backdrop-filter-none motion-safe:transition-transform motion-safe:duration-150 motion-safe:hover:-translate-y-px motion-safe:active:scale-[0.94] motion-reduce:transition-opacity motion-reduce:duration-[80ms] motion-reduce:ease-[var(--ease-out)] motion-reduce:active:opacity-80 bottom-[calc(88px+env(safe-area-inset-bottom,0px))] lg:bottom-20 right-[calc(max(0px,(100vw-var(--app-max-width))/2)+20px)]"
  {onclick}
  aria-label="Add entry"
>
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5"  y1="12" x2="19" y2="12"/>
  </svg>
</button>

<style>
  .fab {
    border: 1px solid color-mix(in srgb, var(--accent) 60%, transparent);
  }
</style>
