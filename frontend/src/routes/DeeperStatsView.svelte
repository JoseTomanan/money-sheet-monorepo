<!-- Deeper statistics — rolling-window (30d/3mo/12mo) view reached from
     Summary's "Deeper stats →" link, not a bottom tab (#132). Every number
     here is read straight from store.stats (STATS sheet, docs/adr/0011) —
     this component renders, it never aggregates raw entries. -->
<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { CATEGORIES, CATEGORY_ORDER } from '../lib/theme';
  import { darkMode } from '../lib/darkMode.svelte';
  import { peso } from '../lib/format';
  import Money from '../components/ui/Money.svelte';
  import SectionHeader from '../components/ui/SectionHeader.svelte';
  import type { StatsWindow } from '../lib/types';

  interface Props {
    onback: () => void;
  }

  let { onback }: Props = $props();

  const WINDOWS: readonly [StatsWindow, string][] = [
    ['30d', '30 days'],
    ['3mo', '3 months'],
    ['12mo', '12 months'],
  ];

  let selected = $state<StatsWindow>('30d');

  // All aggregates re-read the sheet-provided row for the selected window —
  // no client-side aggregation of raw entries (architecture contract).
  const totals = $derived(
    store.stats.windowTotals.find((w) => w.window === selected) ?? { window: selected, incoming: 0, outgoing: 0, net: 0 }
  );

  const categorySpend = $derived(
    CATEGORY_ORDER.map((key) => {
      const row = store.stats.windowCategorySpend.find((w) => w.window === selected && w.category === key);
      return { key, c: CATEGORIES[key], outgoing: row?.outgoing ?? 0 };
    }).sort((a, b) => b.outgoing - a.outgoing)
  );

  const totalOutgoing = $derived(categorySpend.reduce((s, d) => s + d.outgoing, 0));
  const maxSpent = $derived(Math.max(...categorySpend.map((d) => d.outgoing), 1));

  const maxFlow = $derived(Math.max(totals.incoming, totals.outgoing, 1));
  const flowBarPct = (v: number) => (v <= 0 ? 0 : Math.max((v / maxFlow) * 100, 2));

  const grew = $derived(totals.net >= 0);

  // TODO(#128 fast-follow): per-category share of incoming/outgoing, and
  // subcategory drilldowns — noted in the issue as out of scope for this slice.
</script>

<div class="deeper-stats-view p-0 pb-[72px]">
  <!-- Page header with back affordance -->
  <div class="page-header px-5 pt-5 pb-1 flex items-end justify-between">
    <div>
      <button
        class="back-link bg-transparent border-0 cursor-pointer p-0 font-sans text-[13px] font-medium text-accent flex items-center gap-1 mb-1 rounded-[var(--radius-sm)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        aria-label="Back to Summary"
        onclick={onback}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
        Summary
      </button>
      <div class="page-title font-display text-[28px] font-bold text-foreground mt-[2px] tracking-[-0.5px]">Deeper stats</div>
    </div>
  </div>

  <!-- Window selector -->
  <div class="segmented flex shrink-0 gap-[2px] mx-4 mt-3 mb-1" role="radiogroup" aria-label="Rolling window">
    {#each WINDOWS as [val, label] (val)}
      <button
        class="flex-1 py-[6px] px-2 rounded-[var(--radius-sm)] border-0 bg-transparent font-sans text-xs font-medium cursor-pointer whitespace-nowrap transition-[color,background] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        class:bg-muted={selected === val}
        class:text-accent={selected === val}
        class:text-muted-foreground={selected !== val}
        role="radio"
        aria-checked={selected === val}
        onclick={() => (selected = val)}
      >{label}</button>
    {/each}
  </div>

  <!-- Flow: incoming vs outgoing over the window -->
  <SectionHeader>Flow</SectionHeader>
  <div class="card mx-4 px-4 pt-4 pb-4">
    <div class="flow-readout flex items-end justify-center gap-8">
      <div class="flex flex-col items-center gap-2">
        <div class="h-[72px] w-[36px] flex items-end">
          <div
            class="w-full rounded-t-[4px] transition-[height] duration-[400ms] ease-[cubic-bezier(.2,.7,.2,1)]"
            style="height: {flowBarPct(totals.incoming)}%; background: var(--positive); opacity: 0.85;"
          ></div>
        </div>
        <div class="text-center">
          <div class="font-display text-[10px] font-semibold tracking-[1px] uppercase text-muted-foreground">Incoming</div>
          <Money value={totals.incoming} size={15} weight={600} negColor={false} />
        </div>
      </div>
      <div class="flex flex-col items-center gap-2">
        <div class="h-[72px] w-[36px] flex items-end">
          <div
            class="w-full rounded-t-[4px] transition-[height] duration-[400ms] ease-[cubic-bezier(.2,.7,.2,1)]"
            style="height: {flowBarPct(totals.outgoing)}%; background: var(--foreground); opacity: 0.7;"
          ></div>
        </div>
        <div class="text-center">
          <div class="font-display text-[10px] font-semibold tracking-[1px] uppercase text-muted-foreground">Outgoing</div>
          <Money value={totals.outgoing} size={15} weight={600} negColor={false} />
        </div>
      </div>
    </div>
  </div>

  <!-- Net verdict: did money grow or shrink over the window -->
  <div
    class="net-verdict-card card mx-4 mt-[14px] px-4 py-4 flex items-center justify-between"
    class:bg-[var(--destructive-tint-bg)]={!grew}
  >
    <div>
      <div class="font-display text-[10px] font-semibold tracking-[1px] uppercase text-muted-foreground">Net over the window</div>
      <div class="font-sans text-[13px] font-medium mt-[2px]" class:text-positive={grew} class:text-destructive={!grew}>
        {grew ? 'Grew' : 'Shrank'}
      </div>
    </div>
    <div class="flex items-center gap-1">
      <span class="font-sans text-xs" class:text-positive={grew} class:text-destructive={!grew} aria-hidden="true">{grew ? '▲' : '▼'}</span>
      <Money value={totals.net} size={20} weight={700} />
    </div>
  </div>

  <!-- Where it went: window-scoped category breakdown -->
  <SectionHeader>Where it went</SectionHeader>
  <div class="cat-list card mx-4 overflow-hidden">
    <div class="px-4 pt-4 pb-1">
      {#if totalOutgoing > 0}
        <div class="dist-strip dist-bar flex h-[10px] rounded-full overflow-hidden gap-[2px]">
          {#each categorySpend.filter((d) => d.outgoing > 0) as d (d.key)}
            <div
              class="transition-[flex-grow] duration-[600ms] ease-[cubic-bezier(.2,.7,.2,1)]"
              style="flex-grow: {d.outgoing}; flex-basis: 0; background: {d.c.color};"
              title="{d.c.label}: {peso(d.outgoing, store.config.currency)}"
            ></div>
          {/each}
        </div>
      {:else}
        <div class="h-[10px] rounded-full bg-muted"></div>
        <div class="pt-2 font-sans text-[12px] text-muted-foreground">No spending in this window.</div>
      {/if}
    </div>
    {#each categorySpend as d (d.key)}
      <div class="cat-row py-[14px] px-4 border-b border-border last:border-b-0">
        <div class="cat-row-main flex items-center gap-[10px]">
          <span class="cat-dot size-[10px] rounded-full shrink-0" style="background: {darkMode.current ? d.c.darkDot : d.c.dot}; opacity: {d.outgoing > 0 ? 1 : 0.45};"></span>
          <span class="cat-label flex-1 font-sans text-sm font-medium {d.outgoing > 0 ? 'text-foreground' : 'text-muted-foreground'}">{d.c.label}</span>
          <span class="cat-pct font-mono tabular-nums text-[11px] text-muted-foreground min-w-[38px] text-right">
            {totalOutgoing > 0 ? ((d.outgoing / totalOutgoing) * 100).toFixed(1) : '0.0'}%
          </span>
          <div class="shrink-0 text-right min-w-[84px]"><Money value={d.outgoing} size={14} weight={600} negColor={false} /></div>
        </div>
        <div class="mt-2 ml-5 h-1 rounded-[2px] overflow-hidden" style="background: {darkMode.current ? d.c.soft : d.c.pastel};">
          <div
            class="h-full rounded-[2px] transition-[width] duration-[600ms] ease-[cubic-bezier(.2,.7,.2,1)]"
            style="width: {(d.outgoing / maxSpent) * 100}%; background: {darkMode.current ? d.c.darkColor : d.c.color};"
          ></div>
        </div>
      </div>
    {/each}
  </div>
</div>
