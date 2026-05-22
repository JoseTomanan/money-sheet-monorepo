<script lang="ts">
  interface Props {
    description: string;
    pastel: string;
    color: string;
    strikethrough?: boolean;
  }
  let { description, pastel, color, strikethrough = false }: Props = $props();
</script>

<div class="entry-desc-band" style="background: {pastel}80; color: {color};">
  <span class="entry-desc" class:strikethrough>{description || '—'}</span>
</div>

<style>
  .entry-desc-band {
    flex-shrink: 1;
    min-width: 0;
    max-width: 55%;
    padding: 2px 1px;
    border-radius: 0;
  }

  .entry-desc {
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
  }

  .strikethrough {
    text-decoration: line-through;
  }
</style>
