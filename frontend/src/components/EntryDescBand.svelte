<!-- Custom description band with category-color accent; no shadcn equivalent. -->
<script lang="ts">
  interface Props {
    description: string;
    color: string;
    strikethrough?: boolean;
    direction?: 'I' | 'O';
  }
  let { description, color, strikethrough = false, direction = 'O' }: Props = $props();
</script>

<div
  class="entry-desc-band shrink min-w-0 max-w-[55%] px-px py-[2px] rounded-none flex items-center gap-[5px]"
  style={direction === 'I' ? `background: color-mix(in srgb, ${color} 15%, transparent); color: ${color};` : ''}
>
  <span
    class="entry-desc font-sans text-sm min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
    class:font-bold={direction === 'I'}
    class:font-normal={direction !== 'I'}
    class:line-through={strikethrough}
  >{description || '—'}</span>
</div>
