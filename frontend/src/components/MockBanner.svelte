<script lang="ts">
  let { onExit }: { onExit: () => void } = $props();
</script>

<div class="fixed top-0 left-0 right-0 z-[600] h-8 flex items-center justify-center border-b border-border bg-muted">
  <span class="font-sans text-[11px] tracking-[0.03em] text-muted-foreground select-none">Mock mode</span>
  <span class="mx-2 text-[10px] text-border select-none">·</span>
  <button
    onclick={onExit}
    class="font-sans text-[11px] text-accent underline underline-offset-2 decoration-accent/30 hover:decoration-accent/80 transition-colors duration-150 bg-transparent border-0 p-0 cursor-pointer"
  >
    Exit
  </button>
</div>
