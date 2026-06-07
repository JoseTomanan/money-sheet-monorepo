<!-- Loading placeholder block with a warm diagonal light sweep. -->
<script lang="ts">
  interface Props {
    class?: string;
    delay?: number;    // ms — stagger offset for the cascade
    radius?: string;   // CSS value — defaults to var(--radius-sm)
  }

  let { class: className = '', delay = 0, radius = 'var(--radius-sm)' }: Props = $props();
</script>

<div
  class="skeleton {className}"
  style="animation-delay: {delay}ms; border-radius: {radius};"
></div>
