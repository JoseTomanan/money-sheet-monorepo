<!-- Currency display primitive; no shadcn equivalent. -->
<script lang="ts">
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { peso } from '../lib/format';
  import { store } from '../lib/store.svelte';

  interface Props {
    value: number;
    size?: number;
    weight?: number;
    negColor?: boolean;
    positive?: boolean;
    dim?: boolean;
    animate?: boolean;
    colorOverride?: string; // skip palette logic, use this color directly
  }

  let { value, size = 17, weight = 500, negColor = true, positive = false, dim = false, animate = false, colorOverride }: Props = $props();

  const tw = tweened(value, { duration: 500, easing: cubicOut });

  $effect(() => {
    if (animate) tw.set(value);
  });

  // For color/weight decisions, use the live tween value so they transition too.
  const shown = $derived(animate ? $tw : value);

  const color = $derived(
    colorOverride ? colorOverride
    : dim ? 'var(--muted-foreground)'
    : positive ? 'var(--positive)'
    : negColor && shown < 0 ? 'var(--destructive)'
    : 'inherit'
  );

  const effectiveWeight = $derived(weight + (positive || (negColor && shown < 0) ? 100 : 0));
</script>

<span style="
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: {size}px;
  font-weight: {effectiveWeight};
  color: {color};
  letter-spacing: -0.2px;
">{positive ? '+' : ''}{peso(shown, store.config.currency)}</span>
