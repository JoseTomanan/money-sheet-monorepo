<!-- Custom description band with category-color accent; no shadcn equivalent.
     Geometry note for incoming split groups: -mt-3/-mb-3 assume the wrapping row
     uses py-3 (12px). They cancel that padding so adjacent incoming band segments
     meet across the inter-row gap, producing one continuous vertical block spanning
     the whole split group. pt-[14px]/pb-[14px] pair with those negative margins on
     the same edge (12px margin pull + 2px base py-[2px] = 14px) to restore the
     content box on that edge, so the text stays vertically centered on the row's
     date/amount level while the background still spans the gap. -->
<script lang="ts">
  import type { SplitPosition } from '../../lib/groupEntries';

  interface Props {
    description: string;
    color: string;
    strikethrough?: boolean;
    direction?: 'I' | 'O';
    splitPos?: SplitPosition;
  }
  let {
    description,
    color,
    strikethrough = false,
    direction = 'O',
    splitPos = { inGroup: false, isFirst: true, isLast: true },
  }: Props = $props();

  const incomingGroup = $derived(direction === 'I' && splitPos.inGroup);
</script>

<div
  class="entry-desc-band shrink min-w-0 max-w-[55%] px-px py-[2px] rounded-none flex items-center gap-[5px]"
  class:self-stretch={incomingGroup}
  class:-mt-3={incomingGroup && !splitPos.isFirst}
  class:pt-[14px]={incomingGroup && !splitPos.isFirst}
  class:-mb-3={incomingGroup && !splitPos.isLast}
  class:pb-[14px]={incomingGroup && !splitPos.isLast}
  style={direction === 'I' ? `background: color-mix(in srgb, ${color} 15%, transparent); color: ${color};` : ''}
>
  <span
    class="entry-desc font-sans text-sm min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
    class:font-bold={direction === 'I'}
    class:font-normal={direction !== 'I'}
    class:line-through={strikethrough}
  >{description || '—'}</span>
</div>
