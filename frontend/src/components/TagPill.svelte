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
  gap: 5px;
  padding: {small ? '2px 7px' : '3px 9px'};
  font-size: {small ? 10 : 11}px;
  font-weight: 600;
  font-family: var(--font-sans);
  letter-spacing: 0.2px;
  color: {style.color};
  background: {style.soft};
  border-radius: var(--radius-pill);
  line-height: 1.3;
  white-space: nowrap;
">
  <span style="
    width: 5px; height: 5px; border-radius: 50%;
    background: {style.color};
    flex-shrink: 0;
  "></span>
  {tag}
</span>
