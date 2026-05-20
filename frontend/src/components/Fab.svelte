<script lang="ts">
  interface Props {
    onclick: () => void;
  }

  let { onclick }: Props = $props();
</script>

<button class="fab" {onclick} aria-label="Add entry">
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5"  y1="12" x2="19" y2="12"/>
  </svg>
</button>

<style>
  .fab {
    position: fixed;
    right: calc(max(0px, (100vw - var(--app-max-width)) / 2) + 20px);
    bottom: 76px;
    width: 60px;
    height: 60px;
    border-radius: 30px;
    border: 0;
    background: var(--accent);
    color: var(--accent-foreground);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 24px rgba(201, 137, 47, 0.35), 0 2px 6px rgba(0, 0, 0, 0.12);
    z-index: 80;
    transition: transform 120ms, box-shadow 120ms;
  }

  .fab:active {
    transform: scale(0.94);
    box-shadow: 0 4px 12px rgba(201, 137, 47, 0.25);
  }
</style>
