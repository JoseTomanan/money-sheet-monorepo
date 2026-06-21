<!-- Custom horizontal snap carousel for split-entry legs; no shadcn equivalent. -->
<script lang="ts">
  import type { SplitState, Leg } from '../../lib/splitEntry';
  import { isFormula, evaluateFormula } from '../../lib/formula';
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
</script>

<div class="carousel flex overflow-x-auto snap-x snap-mandatory scroll-pl-4 gap-[10px] py-[10px]">
  {#each split.legs as leg, i}
    <div class="leg-card shrink-0 w-[85%] snap-start bg-card border border-border rounded-[var(--radius-lg)] py-3 px-[14px] first:ml-4">
      <div class="leg-head flex items-center justify-between mb-2">
        <span class="leg-label text-[10px] font-sans font-semibold tracking-[1px] uppercase text-muted-foreground">Leg {i + 1}</span>
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
            onupdate(i, { amount: v.startsWith('=') ? v : v.replace(/[^0-9.]/g, '') });
          }}
          onblur={(e) => {
            const v = (e.target as HTMLInputElement).value;
            if (!isFormula(v)) { onupdate(i, { error: undefined }); return; }
            const result = evaluateFormula(v);
            if ('error' in result) {
              onupdate(i, { error: result.error });
            } else if (result.value <= 0) {
              onupdate(i, { error: 'Amount must be positive' });
            } else {
              onupdate(i, { amount: result.value.toFixed(2), error: undefined });
            }
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

  {#if showAddCard}
    <button class="add-card shrink-0 w-[calc(85%/5)] snap-start mr-4 flex flex-col items-center justify-center gap-[6px] border border-dashed border-accent rounded-[var(--radius-lg)] bg-transparent cursor-pointer min-h-[120px] transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]" onclick={onadd}>
      <span class="add-plus text-2xl text-accent leading-none">+</span>
      <span class="add-label font-sans text-[12px] font-medium text-accent">Add leg</span>
    </button>
  {/if}
</div>
