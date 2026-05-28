<!-- Custom description band with category-color accent; no shadcn equivalent. -->
<script lang="ts">
  interface Props {
    description: string;
    pastel: string;
    color: string;
    strikethrough?: boolean;
  }
  let { description, pastel, color, strikethrough = false }: Props = $props();
</script>

<div class="entry-desc-band shrink min-w-0 max-w-[55%] px-px py-[2px] rounded-none" style="background: {pastel}80; color: {color};">
  <span class="entry-desc font-sans text-sm font-medium overflow-hidden text-ellipsis whitespace-nowrap block" class:line-through={strikethrough}>{description || '—'}</span>
</div>
