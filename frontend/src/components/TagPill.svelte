<script lang="ts">
  import { Badge } from '$lib/components/ui/badge';
  import { resolveCategoryStyle } from '../lib/theme';
  import type { Direction } from '../lib/types';

  interface Props {
    tag: string;
    direction: Direction;
    mainCategory: string;
    small?: boolean;
  }

  let { tag, direction: _dir, mainCategory, small = false }: Props = $props();

  const catStyle = $derived(resolveCategoryStyle(mainCategory));
  const fontSize = $derived(small ? 10 : 11);
  const padding  = $derived(small ? '2px 6px' : '3px 8px');
</script>

<Badge
  variant="secondary"
  style="background: {catStyle.soft}; color: {catStyle.color}; font-size: {fontSize}px; padding: {padding};"
>{tag}</Badge>
