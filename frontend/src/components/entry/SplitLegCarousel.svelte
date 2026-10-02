<!-- Custom horizontal snap carousel for split-entry legs; no shadcn equivalent. -->
<script lang="ts">
  import type { SplitState, Leg } from '../../lib/splitEntry';
  import { entryAmount } from '../../lib/amountField';
  import type { Direction, CategoryMap } from '../../lib/types';
  import { store } from '../../lib/store.svelte';
  import CategoryTagPicker from '../category/CategoryTagPicker.svelte';

  interface Props {
    split: SplitState;
    direction: Direction;
    categories: CategoryMap;
    onupdate: (i: number, patch: Partial<Leg>) => void;
    onremove: (i: number) => void;
    onadd: () => void;
    /** Whether to render the ghost "Add leg" card. Pass false in edit mode. */
    showAddCard?: boolean;
    /**
     * Stable tag value per leg used only to pre-expand the parent Category on mount.
     * Mirrors CategoryTagPicker's `initialTag` — allows callers to pass the raw
     * prop (available before reactivity settles) so the picker expands correctly
     * on the first render. Indices correspond to leg indices.
     */
    initialTags?: string[];
  }

  let { split, direction, categories, onupdate, onremove, onadd, showAddCard = true, initialTags }: Props = $props();

  function revealFocusedLeg(event: FocusEvent) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    target.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }
</script>

<div class="split-rail min-w-0">
  {#if showAddCard}
    <div class="flex items-center justify-between gap-3 px-4 pt-[10px]">
      <span class="font-sans text-xs text-muted-foreground">
        {split.legs.length} {split.legs.length === 1 ? 'leg' : 'legs'}
      </span>
      <button
        class="add-card min-h-11 shrink-0 flex items-center gap-2 rounded-[var(--radius-pill)] border border-accent bg-transparent px-[14px] font-sans text-[13px] font-semibold text-accent cursor-pointer transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
        onclick={onadd}
      >
        <span class="text-lg leading-none" aria-hidden="true">+</span>
        <span>Add leg</span>
      </button>
    </div>
  {/if}

  <div
    class="carousel flex overflow-x-auto snap-x snap-mandatory scroll-pl-4 gap-[10px] py-[10px]"
    aria-label="Entry legs"
    onfocusin={revealFocusedLeg}
  >
    {#each split.legs as leg, i}
      <div class="leg-card shrink-0 {split.legs.length === 1 ? 'w-[calc(100%-32px)]' : 'w-[85%]'} snap-start bg-card border border-border rounded-[var(--radius-lg)] py-3 px-[14px] first:ml-4 last:mr-4">
        <div class="leg-head flex items-center justify-between mb-2">
          <span class="leg-label text-[10px] font-sans font-semibold tracking-[1px] uppercase text-muted-foreground">Leg {i + 1} of {split.legs.length}</span>
          <button
            class="leg-remove bg-transparent border-0 font-sans text-xs text-destructive cursor-pointer p-0 disabled:opacity-30 disabled:cursor-not-allowed"
            disabled={split.legs.length <= 1}
            onclick={() => onremove(i)}
          >Remove</button>
        </div>
        <div class="amount-row flex items-baseline gap-[3px] mb-[10px]">
          <span class="peso font-mono text-[36px] font-medium text-muted-foreground">{store.config.currency}</span>
          <input
            type="text"
            inputmode="decimal"
            class="amount-input bg-transparent border-0 outline-none font-mono text-[36px] font-medium text-foreground tracking-[-0.8px] w-full text-right placeholder:text-muted-foreground"
            value={leg.amount}
            oninput={(e) => {
              const v = (e.target as HTMLInputElement).value;
              onupdate(i, { amount: entryAmount.sanitize(v) });
            }}
            onblur={(e) => {
              const v = (e.target as HTMLInputElement).value;
              const { amount, error } = entryAmount.resolve(v);
              onupdate(i, { ...(amount !== null && { amount }), error: error ?? undefined });
            }}
            placeholder="0.00"
          />
          {#if leg.error}
            <p class="leg-error mt-1 text-[11px] font-sans text-destructive">{leg.error}</p>
          {/if}
        </div>
        <CategoryTagPicker
          {direction}
          {categories}
          tag={leg.tag}
          initialTag={initialTags?.[i]}
          compact
          onselect={(t) => onupdate(i, { tag: t })}
        />
      </div>
    {/each}
  </div>
</div>
