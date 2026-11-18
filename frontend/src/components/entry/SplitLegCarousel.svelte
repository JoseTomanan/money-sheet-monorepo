<!-- Custom horizontal snap carousel for split-entry legs; no shadcn equivalent. -->
<script lang="ts">
  import { pressFeedback } from '../../lib/pressFeedback';
  import { tick, untrack } from 'svelte';
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
  let rail: HTMLDivElement;
  let nextKey = untrack(() => split.legs.length);
  let keys = $state(untrack(() => split.legs.map((_, i) => i)));
  function easing() {
    return getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim() || 'cubic-bezier(0.23, 1, 0.32, 1)';
  }
  async function add(event: MouseEvent) {
    const oldLength = split.legs.length;
    const key = nextKey++;
    keys.push(key);
    onadd();
    await tick();
    const index = keys.indexOf(key);
    const input = index < 0 ? null : rail.querySelectorAll<HTMLInputElement>('[data-entry-amount]').item(index);
    input?.focus();
    const card = input?.closest<HTMLElement>('.leg-card');
    if (event.detail > 0 && split.legs.length > oldLength && card && typeof card.animate === 'function') {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      card.animate(
        reduced ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateX(12px)' }, { opacity: 1, transform: 'translateX(0)' }],
        { duration: reduced ? 80 : 160, easing: easing() },
      );
    }
  }
  async function remove(index: number, event: MouseEvent) {
    if (event.detail > 0) {
      const card = (event.currentTarget as HTMLElement).closest<HTMLElement>('.leg-card');
      if (card && typeof card.animate === 'function') {
        const rect = card.getBoundingClientRect();
        const ghost = card.cloneNode(true) as HTMLElement;
        ghost.inert = true;
        ghost.setAttribute('aria-hidden', 'true');
        ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;pointer-events:none;z-index:100;`;
        document.body.appendChild(ghost);
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const animation = ghost.animate(
          reduced ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(-8px)' }],
          { duration: reduced ? 80 : 100, easing: easing() },
        );
        animation.finished.catch(() => {}).finally(() => ghost.remove());
      }
    }
    keys.splice(index, 1);
    onremove(index);
    await tick();
    rail.querySelectorAll<HTMLInputElement>('[data-entry-amount]').item(Math.min(index, split.legs.length - 1))?.focus();
  }

  function revealFocusedLeg(event: FocusEvent) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    target.scrollIntoView?.({
      block: 'nearest',
      inline: 'nearest',
    });
  }
</script>

<div bind:this={rail} class="split-rail min-w-0">
  <div
    class="carousel flex overflow-x-auto snap-x snap-mandatory scroll-pl-4 gap-[10px] py-[10px] lg:scroll-pl-0 lg:gap-3 lg:py-2"
    aria-label="Entry legs"
    onfocusin={revealFocusedLeg}
  >
    {#each split.legs as leg, i (keys[i])}
      <div class="leg-card relative shrink-0 {split.legs.length === 1 ? 'w-[calc(100%-32px)] lg:w-full' : 'w-[85%] lg:w-[calc(50%-6px)]'} snap-start bg-card border border-border rounded-[var(--radius-lg)] py-3 px-[14px] first:ml-4 last:mr-4 lg:first:ml-0 lg:last:mr-0">
        <div class="leg-head flex items-center justify-between mb-2">
          <span class="leg-label text-[10px] font-sans font-semibold tracking-[1px] uppercase text-muted-foreground">Leg {i + 1} of {split.legs.length}</span>
        </div>
        <div class="amount-row flex items-baseline gap-[3px] mb-[10px]">
          <span class="peso font-mono text-[36px] font-medium text-muted-foreground">{store.config.currency}</span>
          <input
            data-entry-amount
            aria-label={`Amount for leg ${i + 1}`}
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
        <button
          class="leg-remove absolute top-3 right-[14px] bg-transparent border-0 font-sans text-xs text-destructive cursor-pointer p-0 disabled:opacity-30 disabled:cursor-not-allowed"
          disabled={split.legs.length <= 1}
          onclick={(event) => remove(i, event)}
        >Remove</button>
      </div>
    {/each}
  </div>
  {#if showAddCard}
    <div class="flex items-center justify-between gap-3 px-4 pb-2 lg:px-0">
      <span class="font-sans text-xs text-muted-foreground">{split.legs.length} {split.legs.length === 1 ? 'leg' : 'legs'}</span>
      <button class="press-feedback add-card min-h-11 shrink-0 flex items-center gap-2 rounded-[var(--radius-pill)] border border-accent bg-transparent px-[14px] font-sans text-[13px] font-semibold text-accent cursor-pointer hover:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] lg:min-h-8" use:pressFeedback onclick={add}>
        <span class="text-lg leading-none" aria-hidden="true">+</span><span>Add leg</span>
      </button>
    </div>
  {/if}
</div>
