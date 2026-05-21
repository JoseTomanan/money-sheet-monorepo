<script lang="ts">
  import { peso } from '../lib/format';

  interface Props {
    value: number;
    size?: number;
    weight?: number;
    negColor?: boolean;
    positive?: boolean;
    dim?: boolean;
  }

  let { value, size = 17, weight = 500, negColor = true, positive = false, dim = false }: Props = $props();

  const color = $derived(
    dim ? 'var(--muted-foreground)'
    : positive ? 'var(--positive)'
    : negColor && value < 0 ? 'var(--destructive)'
    : negColor && value > 0 ? 'inherit'
    : 'inherit'
  );
</script>

<span style="
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: {size}px;
  font-weight: {weight};
  color: {color};
  letter-spacing: -0.2px;
">{peso(value)}</span>
