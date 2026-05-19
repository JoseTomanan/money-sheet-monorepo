<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    open: boolean;
    onclose: () => void;
    children: Snippet;
  }

  let { open, onclose, children }: Props = $props();

  function handleBackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    role="presentation"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    onclick={handleBackdrop}
  >
    <div class="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
      {@render children()}
    </div>
  </div>
{/if}
