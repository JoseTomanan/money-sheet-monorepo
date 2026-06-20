<!-- Two-step Category → Subcategory tag picker.
     Outgoing: Category row always visible; tapping a Category expands its Subcategory row.
     Incoming: Category row only; tapping a Category calls onselect immediately. -->
<script lang="ts">
  import { untrack } from 'svelte';
  import { resolveCategoryStyle, CATEGORY_ORDER } from '../../lib/theme';
  import { darkMode } from '../../lib/darkMode.svelte';
  import { getMainCategory } from '../../lib/domain';
  import type { Direction, CategoryMap } from '../../lib/types';

  interface Props {
    direction: Direction;
    categories: CategoryMap;
    tag: string;
    onselect: (tag: string) => void;
    compact?: boolean;
    /** Stable tag value used only to pre-expand the parent Category on mount.
     *  When omitted, falls back to `tag`. Allows callers that derive `tag` from
     *  reactive $state (e.g. EntrySheet) to pass `entry?.tag` (a prop, available
     *  immediately on first render) instead of the deferred $state value. */
    initialTag?: string;
  }

  let { direction, categories, tag, onselect, compact = false, initialTag }: Props = $props();

  // When editing an Outgoing entry that already has a tag, pre-expand its parent category.
  // untrack() because we intentionally want the mount-time value only — the parent uses
  // {#key direction} to re-mount this component when direction changes.
  let activeCategory = $state(
    untrack(() => {
      const seed = initialTag !== undefined ? initialTag : tag;
      return direction === 'O' && seed ? getMainCategory(seed, categories) : '';
    })
  );

  const sortedCategories = $derived([
    ...CATEGORY_ORDER.filter(k => k in categories),
    ...Object.keys(categories).filter(k => !CATEGORY_ORDER.includes(k as typeof CATEGORY_ORDER[number])),
  ]);
  const subcategories = $derived(
    activeCategory ? (categories[activeCategory] ?? []) : []
  );

  function handleCategoryClick(cat: string) {
    if (direction === 'I') {
      onselect(cat);
    } else {
      activeCategory = activeCategory === cat ? '' : cat;
    }
  }

  // Pill size classes (full vs compact)
  const catPillClass = $derived(
    compact
      ? 'tag-pill shrink-0 flex items-center gap-1 py-[5px] px-[10px] rounded-[var(--radius-pill)] border-0 font-sans text-[11px] font-semibold cursor-pointer transition-[background,color] duration-150 whitespace-nowrap'
      : 'tag-pill shrink-0 flex items-center gap-[6px] py-2 px-[14px] rounded-[var(--radius-pill)] border-0 font-sans text-[13px] font-semibold cursor-pointer transition-[background,color] duration-150 whitespace-nowrap'
  );
  const dotClass = $derived(compact ? 'size-[5px] rounded-full shrink-0' : 'size-[6px] rounded-full shrink-0');
</script>

<!-- Label (single line — reads "Subcategory" when drilled in, "Category" otherwise) -->
{#if !compact}
  <div class="picker-label label-overline px-5 pt-[14px] pb-[6px]">
    {direction === 'O' && activeCategory ? 'Subcategory' : 'Category'}
  </div>
{/if}

<!-- Single row: drill-in on Outgoing, flat list on Incoming / uncollapsed -->
<div class="picker-row flex gap-2 px-4 py-1 overflow-x-auto md:flex-wrap md:overflow-x-visible">
  {#if direction === 'O' && activeCategory}
    {@const s = resolveCategoryStyle(activeCategory)}
    <!-- Pinned chosen-category pill with ‹ back affordance -->
    <button
      class={catPillClass}
      aria-pressed={true}
      aria-label={activeCategory}
      style="background: {s.color}; color: #fff;"
      onclick={() => handleCategoryClick(activeCategory)}
    >
      <span class={dotClass} style="background: #fff"></span>
      ‹ {activeCategory}
    </button>
    <!-- Vertical divider -->
    <span class="w-px self-stretch bg-border shrink-0"></span>
    <!-- Subcategory pills -->
    {#each subcategories as sub}
      {@const isActive = tag === sub}
      {@const inactiveColor = darkMode.current ? s.darkColor : s.color}
      <button
        class={catPillClass}
        aria-pressed={isActive}
        style="background: {isActive ? s.color : s.soft}; color: {isActive ? '#fff' : inactiveColor};"
        onclick={() => onselect(sub)}
      >
        <span class={dotClass} style="background: {isActive ? '#fff' : inactiveColor}"></span>
        {sub}
      </button>
    {/each}
  {:else}
    <!-- All category pills (collapsed / Incoming) -->
    {#each sortedCategories as cat}
      {@const s = resolveCategoryStyle(cat)}
      {@const isActive = direction === 'I' ? tag === cat : activeCategory === cat}
      {@const inactiveColor = darkMode.current ? s.darkColor : s.color}
      <button
        class={catPillClass}
        aria-pressed={isActive}
        style="background: {isActive ? s.color : s.soft}; color: {isActive ? '#fff' : inactiveColor};"
        onclick={() => handleCategoryClick(cat)}
      >
        <span class={dotClass} style="background: {isActive ? '#fff' : inactiveColor}"></span>
        {cat}
      </button>
    {/each}
  {/if}
</div>
