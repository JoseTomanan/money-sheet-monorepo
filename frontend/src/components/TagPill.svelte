<script lang="ts">
  import { CATEGORIES } from '../lib/theme';
  import type { Direction } from '../lib/types';

  interface Props {
    tag: string;
    direction: Direction;
    mainCategory: string;
    small?: boolean;
  }

  let { tag, direction: _dir, mainCategory, small = false }: Props = $props();

  const style = $derived(CATEGORIES[mainCategory] ?? { color: 'var(--muted-foreground)', soft: 'var(--muted)', label: mainCategory });
</script>

<span style="
  display: inline-flex;
  align-items: center;
  padding: {small ? '2px 6px' : '3px 8px'};
  font-size: {small ? 10 : 11}px;
  font-weight: 500;
  font-family: var(--font-sans);
  letter-spacing: 0.2px;
  color: {style.color};
  background: {style.soft};
  border-radius: var(--radius-pill);
  line-height: 1.3;
  white-space: nowrap;
">
  {tag}
</span>
