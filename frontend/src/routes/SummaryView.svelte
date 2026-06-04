<script lang="ts">
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { onMount } from 'svelte';
  import { store } from '../lib/store.svelte';
  import RedistributeSheet from '../components/RedistributeSheet.svelte';
  import type { AddEntryPayload } from '../lib/types';
  import { CATEGORIES, CATEGORY_ORDER } from '../lib/theme';
  import { peso } from '../lib/format';
  import { totalOutgoing, outgoingByCategory, outgoingByMonth, incomingByMonth } from '../lib/aggregations';
  import { currentYearMonth } from '../lib/format';
  import Money from '../components/Money.svelte';
  import SectionHeader from '../components/SectionHeader.svelte';

  const now = new Date();
  const monthLabel = now.toLocaleString('en-PH', { month: 'long', year: 'numeric' });

  const ym = currentYearMonth();
  const spendTotal = $derived(totalOutgoing(store.entries));
  const spendByCategory = $derived(outgoingByCategory(store.entries));
  const monthIncoming = $derived(incomingByMonth(store.entries, ym));
  const monthOutgoing = $derived(outgoingByMonth(store.entries, ym));

  let redistOpen = $state(false);

  const categoryData = $derived(
    CATEGORY_ORDER.map((key) => {
      const c = CATEGORIES[key];
      const budget = store.master.budgets[key] ?? 0;
      const spent = spendByCategory[key] ?? 0;
      const pct = spendTotal > 0 ? (spent / spendTotal) * 100 : 0;
      return { key, c, budget, spent, pct };
    })
  );

  const maxSpent = $derived(Math.max(...categoryData.map(d => d.spent), 1));

  // Animated bar widths (0 → actual %)
  const barWidths = tweened(
    Object.fromEntries(CATEGORY_ORDER.map(k => [k, 0])),
    { duration: 600, easing: cubicOut }
  );

  onMount(() => {
    const target = Object.fromEntries(categoryData.map(d => [d.key, (d.spent / maxSpent) * 100]));
    barWidths.set(target);
  });
</script>

<div class="summary-view p-0" style="padding-bottom: 72px;">
{#if store.loading}
  <!-- Skeleton -->
  <div class="page-header px-5 pt-5 pb-1">
    <div class="h-[10px] w-[100px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
    <div class="h-[28px] w-[160px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite] mt-[6px]"></div>
  </div>
  <div class="bg-card rounded-[var(--radius-lg)] shadow-[var(--shadow-card)] mx-4 mt-[14px] pt-5 pb-5 px-[22px] flex items-center justify-between">
    <div>
      <div class="h-[8px] w-[50px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
      <div class="h-[26px] w-[130px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite] mt-2"></div>
    </div>
    <div class="text-right flex flex-col gap-[6px]">
      <div>
        <div class="h-[8px] w-[60px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
        <div class="h-[15px] w-[70px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite] mt-1"></div>
      </div>
      <div>
        <div class="h-[8px] w-[60px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
        <div class="h-[15px] w-[70px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite] mt-1"></div>
      </div>
    </div>
  </div>
  <div class="flex gap-2 px-4 pt-[14px] pb-2">
    <div class="h-[36px] w-[130px] rounded-[var(--radius-pill)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
  </div>
  <div class="px-5 pt-2 pb-2">
    <div class="h-[10px] w-[100px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
  </div>
  <div class="bg-card rounded-[var(--radius-lg)] shadow-[var(--shadow-card)] mx-4 overflow-hidden">
    {#each [0, 1, 2, 3, 4] as _}
      <div class="py-[14px] px-4 border-b border-border last:border-0">
        <div class="flex items-center gap-[10px]">
          <div class="size-[10px] rounded-full bg-border animate-[shimmer_1s_ease-in-out_infinite] shrink-0"></div>
          <div class="h-[14px] flex-1 rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
          <div class="h-[14px] w-[56px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
        </div>
        <div class="mt-2 ml-5 h-1 rounded-[2px] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
      </div>
    {/each}
  </div>
{:else}
  <!-- Page header -->
  <div class="page-header px-5 pt-5 pb-1">
    <div class="page-eyebrow font-display text-xs font-semibold tracking-[1.2px] uppercase text-muted-foreground">{monthLabel.toUpperCase()}</div>
    <div class="page-title font-display text-[28px] font-bold text-foreground mt-[2px] tracking-[-0.5px]">Summary</div>
  </div>

  <!-- On Hand card -->
  <div class="onhand-card bg-card rounded-[var(--radius-lg)] shadow-[var(--shadow-card)] mx-4 mt-[14px] pt-5 pb-5 px-[22px] flex items-center justify-between">
    <div class="onhand-left">
      <div class="card-label font-display text-[11px] font-semibold tracking-[1.2px] uppercase text-muted-foreground">On Hand</div>
      <div
        class="onhand-amount font-mono tabular-nums mt-1 text-[26px] font-medium text-foreground tracking-[-0.6px]"
        class:animate-[shimmer_1s_ease-in-out_infinite]={store.masterLoading}
        class:opacity-40={store.masterLoading}
      >
        {peso(store.master.onHand, store.config.currency)}
      </div>
    </div>
    <div class="onhand-right text-right mt-1 flex flex-col gap-[6px]">
      <div>
        <div class="card-label font-display text-[11px] font-semibold tracking-[1.2px] uppercase text-muted-foreground">Incoming ↑</div>
        <Money value={monthIncoming} size={15} weight={500} negColor={true} dim={store.masterLoading} />
      </div>
      <div>
        <div class="card-label font-display text-[11px] font-semibold tracking-[1.2px] uppercase text-muted-foreground">Outgoing ↓</div>
        <Money value={monthOutgoing} size={15} weight={500} negColor={false} dim={store.masterLoading} />
      </div>
    </div>
  </div>

  <!-- Actions strip -->
  <div class="actions-strip flex gap-2 px-4 pt-[14px] pb-2">
    <button
      class="action-chip flex items-center gap-[6px] py-[8px] px-[14px] rounded-[var(--radius-pill)] bg-card shadow-[var(--shadow-card)] border-0 cursor-pointer font-sans text-[13px] font-semibold text-foreground"
      onclick={() => (redistOpen = true)}
      aria-label="Redistribute"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M7 16V4m0 0L3 8m4-4 4 4"/>
        <path d="M17 8v12m0 0 4-4m-4 4-4-4"/>
      </svg>
      Redistribute
    </button>
  </div>

  <!-- Distribution bar -->
  <SectionHeader>
    {#snippet children()}Distribution{/snippet}
  </SectionHeader>
  <div class="dist-bar-wrap mx-4 flex flex-col gap-2">
    <div class="dist-bar flex h-5 bg-muted gap-[2px]">
      {#each categoryData as d}
        <div
          class="dist-segment transition-[flex] duration-[500ms] ease-[cubic-bezier(.2,.7,.2,1)]"
          class:dist-segment--zero={d.spent === 0}
          title="{d.c.label}: {peso(d.spent, store.config.currency)}"
          style="
            {d.spent > 0 ? `flex: ${d.spent};` : ''}
            background: {d.c.color};
          "
        ></div>
      {/each}
    </div>
    <!-- legend dots -->
    <div class="dist-legend flex flex-wrap gap-x-[14px] gap-y-2">
      {#each categoryData.filter(d => d.spent > 0) as d}
        <span class="legend-item flex items-center gap-[5px] font-sans text-[11px] text-muted-foreground font-medium">
          <span class="legend-dot size-[6px] rounded-full shrink-0" style="background: {d.c.dot};"></span>
          {d.c.label} {d.pct.toFixed(1)}%
        </span>
      {/each}
    </div>
  </div>

  <!-- By Category breakdown -->
  <SectionHeader>
    {#snippet children()}By Category{/snippet}
  </SectionHeader>
  <div class="cat-list bg-card rounded-[var(--radius-lg)] shadow-[var(--shadow-card)] mx-4 overflow-hidden md:grid md:grid-cols-2">
    {#each categoryData.sort((a, b) => b.spent - a.spent) as d, i}
      <div
        class="cat-row py-[14px] px-4 md:border-b md:border-border"
        style="border-bottom: {i < categoryData.length - 1 ? '1px solid var(--border)' : 'none'};"
      >
        <div class="cat-row-main flex items-center gap-[10px]">
          <span class="cat-dot size-[10px] rounded-full shrink-0" style="background: {d.c.dot};"></span>
          <span class="cat-label flex-1 font-sans text-sm font-medium text-foreground">{d.c.label}</span>
          <span class="cat-pct font-mono tabular-nums text-[11px] text-muted-foreground min-w-[38px] text-right">
            {d.pct.toFixed(1)}%
          </span>
          <Money value={d.budget} size={14} weight={500} dim={store.masterLoading} />
        </div>
        <!-- animated bar -->
        <div class="cat-bar-track mt-2 ml-5 h-1 rounded-[2px] overflow-hidden" style="background: {d.c.pastel};">
          <div
            class="cat-bar-fill h-full rounded-[2px] transition-[width] duration-[600ms] ease-[cubic-bezier(.2,.7,.2,1)]"
            style="width: {$barWidths[d.key] ?? 0}%; background: {d.c.color}cc;"
          ></div>
        </div>
      </div>
    {/each}
  </div>
{/if}

<RedistributeSheet
  open={redistOpen}
  categories={store.categories}
  onclose={() => (redistOpen = false)}
  onsubmit={(legs: AddEntryPayload[]) => { store.addEntry(legs); redistOpen = false; }}
/>
</div>

<style>
  .dist-segment--zero {
    flex: none;
    width: 2px;
    opacity: 1;
  }
</style>
