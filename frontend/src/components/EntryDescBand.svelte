<!-- Custom description band with category-color accent; no shadcn equivalent. -->
<script lang="ts">
  interface Props {
    description: string;
    pastel: string;
    color: string;
    strikethrough?: boolean;
    plain?: boolean;
  }
  let { description, pastel, color, strikethrough = false, plain = false }: Props = $props();
</script>

<div
  class="entry-desc-band shrink min-w-0 max-w-[55%] px-px py-[2px] rounded-none"
  style={plain ? `color: ${color};` : `background: ${pastel}80; color: ${color};`}
>
  <span
    class="entry-desc font-sans text-sm overflow-hidden text-ellipsis whitespace-nowrap block"
    class:font-semibold={plain}
    class:font-medium={!plain}
    class:line-through={strikethrough}
  >{description || '—'}</span>
</div>
