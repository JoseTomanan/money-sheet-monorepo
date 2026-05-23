<script lang="ts">
  interface Props {
    onclick: () => void;
  }

  let { onclick }: Props = $props();
</script>

<button class="fab" {onclick} aria-label="Add entry">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5"  y1="12" x2="19" y2="12"/>
  </svg>
</button>

<style>
  .fab {
    position: fixed;
    right: calc(max(0px, (100vw - var(--app-max-width)) / 2) + 20px);
    bottom: 80px;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 1px solid color-mix(in srgb, var(--accent) 60%, transparent);
    background: color-mix(in srgb, var(--accent) 60%, transparent);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    color: #fff;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent), 0 1px 2px rgba(13, 148, 136, 0.08), 0 4px 12px rgba(13, 148, 136, 0.16);
    z-index: 80;
    transition: transform 150ms;
  }

  .fab:hover { transform: translateY(-1px); }

  .fab:active {
    transform: scale(0.94);
  }
</style>
