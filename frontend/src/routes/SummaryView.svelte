<script lang="ts">
  import { store } from '../lib/store.svelte';
  import RedistributeSheet from '../components/RedistributeSheet.svelte';
  import type { AddEntryPayload } from '../lib/types';
  import { CATEGORIES, CATEGORY_ORDER } from '../lib/theme';
  import { darkMode } from '../lib/darkMode.svelte';
  import { peso, currentYearMonth, monthLabel, monthShort, shiftYearMonth } from '../lib/format';
  import {
    outgoingByCategory,
    outgoingByMonth,
    incomingByMonth,
    flowByMonth,
    cumulativeOutgoingByDay,
  } from '../lib/aggregations';
  import Money from '../components/Money.svelte';
  import SectionHeader from '../components/SectionHeader.svelte';
  import FlowChart from '../components/charts/FlowChart.svelte';
  import PaceChart from '../components/charts/PaceChart.svelte';

  interface Props {
    onbulkdelete: () => void;
  }

  let { onbulkdelete }: Props = $props();

  let redistOpen = $state(false);

  // The whole view is scoped to one selected month, defaulting to the current one.
  const thisYm = currentYearMonth();
  const windowStart = shiftYearMonth(thisYm, -5);
  let selectedYm = $state(currentYearMonth());

  const canPrev = $derived(selectedYm > windowStart);
  const canNext = $derived(selectedYm < thisYm);

  const monthIncoming = $derived(incomingByMonth(store.entries, selectedYm));
  const monthOutgoing = $derived(outgoingByMonth(store.entries, selectedYm));

  const flow = $derived(flowByMonth(store.entries, thisYm, 6));

  const prevYm = $derived(shiftYearMonth(selectedYm, -1));
  const paceCur = $derived(cumulativeOutgoingByDay(store.entries, selectedYm));
  const pacePrev = $derived(cumulativeOutgoingByDay(store.entries, prevYm));
  const pacePrevShown = $derived((pacePrev[pacePrev.length - 1] ?? 0) > 0 ? pacePrev : []);
  const upToDay = $derived(
    selectedYm === thisYm ? Math.min(new Date().getDate(), paceCur.length) : paceCur.length
  );

  // Pace delta: spend so far vs the same day of the previous month.
  const paceDelta = $derived.by(() => {
    const cmpDay = Math.min(upToDay, pacePrev.length);
    const prevAt = pacePrev[cmpDay - 1] ?? 0;
    const curAt = paceCur[upToDay - 1] ?? 0;
    return prevAt > 0 ? ((curAt - prevAt) / prevAt) * 100 : null;
  });

  const spendByCategory = $derived(outgoingByCategory(store.entries, selectedYm));

  const categoryData = $derived(
    CATEGORY_ORDER.map((key) => {
      const c = CATEGORIES[key];
      const budget = store.master.budgets[key] ?? 0;
      const spent = spendByCategory[key] ?? 0;
      const pct = monthOutgoing > 0 ? (spent / monthOutgoing) * 100 : 0;
      return { key, c, budget, spent, pct };
    }).sort((a, b) => b.spent - a.spent)
  );

  const maxSpent = $derived(Math.max(...categoryData.map(d => d.spent), 1));

  // Category bars grow from 0 on the first paint after data arrives;
  // CSS width transitions handle month switches from then on.
  let appear = $state(false);
  $effect(() => {
    if (!store.loading && !appear) {
      requestAnimationFrame(() => requestAnimationFrame(() => (appear = true)));
    }
  });
  const barWidth = (spent: number) => (appear ? (spent / maxSpent) * 100 : 0);
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
      <div class="h-[8px] w-[60px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
      <div class="h-[15px] w-[100px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite] mt-2"></div>
    </div>
    <div class="text-right">
      <div class="h-[8px] w-[60px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite] ml-auto"></div>
      <div class="h-[15px] w-[100px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite] mt-2"></div>
    </div>
  </div>
  <div class="flex gap-2 px-4 pt-[14px] pb-2">
    <div class="h-[36px] w-[130px] rounded-[var(--radius-pill)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
  </div>
  <div class="px-5 pt-2 pb-2">
    <div class="h-[10px] w-[100px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
  </div>
  <div class="bg-card rounded-[var(--radius-lg)] shadow-[var(--shadow-card)] mx-4 p-4">
    <div class="h-[110px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
  </div>
  <div class="bg-card rounded-[var(--radius-lg)] shadow-[var(--shadow-card)] mx-4 mt-[14px] overflow-hidden">
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
  <!-- Page header with month stepper -->
  <div class="page-header px-5 pt-5 pb-1 flex items-end justify-between">
    <div>
      <div class="page-eyebrow font-display text-xs font-semibold tracking-[1.2px] uppercase text-muted-foreground">{monthLabel(selectedYm).toUpperCase()}</div>
      <div class="page-title font-display text-[28px] font-bold text-foreground mt-[2px] tracking-[-0.5px]">Summary</div>
    </div>
    <div class="month-stepper flex gap-[6px] pb-1">
      <button
        class="size-[30px] rounded-full bg-card shadow-[var(--shadow-card)] border-0 cursor-pointer flex items-center justify-center text-foreground disabled:opacity-30 disabled:cursor-default"
        disabled={!canPrev}
        onclick={() => (selectedYm = shiftYearMonth(selectedYm, -1))}
        aria-label="Previous month"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <button
        class="size-[30px] rounded-full bg-card shadow-[var(--shadow-card)] border-0 cursor-pointer flex items-center justify-center text-foreground disabled:opacity-30 disabled:cursor-default"
        disabled={!canNext}
        onclick={() => (selectedYm = shiftYearMonth(selectedYm, 1))}
        aria-label="Next month"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
    </div>
  </div>

  <!-- Incoming / Outgoing card — readout for the selected month -->
  <div class="io-card rounded-[var(--radius-lg)] mx-4 mt-[14px] pt-5 pb-5 px-[22px] flex items-center justify-between relative overflow-hidden"
    style="background: var(--gradient-hero); box-shadow: var(--shadow-hero), var(--ring-inset);">

    <div class="io-incoming">
      <div class="card-label font-display text-[11px] font-semibold tracking-[1.2px] uppercase text-muted-foreground">Incoming ↑</div>
      <Money value={monthIncoming} size={15} weight={500} negColor={true} dim={store.masterLoading} />
    </div>
    <div class="io-outgoing text-right">
      <div class="card-label font-display text-[11px] font-semibold tracking-[1.2px] uppercase text-muted-foreground">Outgoing ↓</div>
      <Money value={monthOutgoing} size={15} weight={500} negColor={false} dim={store.masterLoading} />
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
    <button
      class="action-chip flex items-center gap-[6px] py-[8px] px-[14px] rounded-[var(--radius-pill)] bg-card shadow-[var(--shadow-card)] border-0 cursor-pointer font-sans text-[13px] font-semibold text-destructive"
      onclick={onbulkdelete}
      aria-label="Bulk delete entries"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        <path d="M10 11v6"/>
        <path d="M14 11v6"/>
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
      </svg>
      Bulk delete
    </button>
  </div>

  <div class="md:grid md:grid-cols-2">
    <!-- Flow: last 6 months, mirrored incoming/outgoing -->
    <div class="flex flex-col">
      <SectionHeader>
        {#snippet children()}Flow{/snippet}
      </SectionHeader>
      <div class="bg-card rounded-[var(--radius-lg)] shadow-[var(--shadow-card)] mx-4 px-4 pt-3 pb-3 flex-1">
        <FlowChart data={flow} selected={selectedYm} onselect={(ym) => (selectedYm = ym)} />
      </div>
    </div>

    <!-- Pace: cumulative spend vs previous month -->
    <div class="flex flex-col">
      <SectionHeader>
        {#snippet children()}Spending pace{/snippet}
        {#snippet right()}
          {#if paceDelta !== null}
            <span
              class="font-mono tabular-nums text-[11px] font-semibold"
              style="color: {paceDelta > 2 ? 'var(--destructive)' : paceDelta < -2 ? 'var(--positive)' : 'var(--muted-foreground)'};"
            >{paceDelta > 0 ? '+' : ''}{paceDelta.toFixed(0)}% vs {monthShort(prevYm)}</span>
          {/if}
        {/snippet}
      </SectionHeader>
      <div class="bg-card rounded-[var(--radius-lg)] shadow-[var(--shadow-card)] mx-4 px-4 pt-3 pb-3 flex-1">
        <PaceChart
          current={paceCur}
          previous={pacePrevShown}
          {upToDay}
          curLabel={monthShort(selectedYm)}
          prevLabel={monthShort(prevYm)}
        />
      </div>
    </div>
  </div>

  <!-- Where it went: month-scoped category breakdown, ranked by spend -->
  <SectionHeader>
    {#snippet children()}Where it went{/snippet}
  </SectionHeader>
  <div class="cat-list bg-card rounded-[var(--radius-lg)] shadow-[var(--shadow-card)] mx-4 overflow-hidden md:grid md:grid-cols-2">
    <!-- distribution strip -->
    <div class="px-4 pt-4 pb-1 md:col-span-2">
      {#if monthOutgoing > 0}
        <div class="dist-strip flex h-[10px] rounded-full overflow-hidden gap-[2px]">
          {#each categoryData.filter(d => d.spent > 0) as d (d.key)}
            <div
              class="transition-[flex-grow] duration-[600ms] ease-[cubic-bezier(.2,.7,.2,1)]"
              style="flex-grow: {d.spent}; flex-basis: 0; background: {d.c.color};"
              title="{d.c.label}: {peso(d.spent, store.config.currency)}"
            ></div>
          {/each}
        </div>
      {:else}
        <div class="h-[10px] rounded-full bg-muted"></div>
        <div class="pt-2 font-sans text-[12px] text-muted-foreground">No spending in {monthLabel(selectedYm)}.</div>
      {/if}
    </div>
    {#each categoryData as d, i (d.key)}
      <div
        class="cat-row py-[14px] px-4 border-b border-border last:border-b-0"
      >
        <div class="cat-row-main flex items-center gap-[10px]">
          <span class="cat-dot size-[10px] rounded-full shrink-0" style="background: {darkMode.current ? d.c.darkDot : d.c.dot}; opacity: {d.spent > 0 ? 1 : 0.45};"></span>
          <span class="cat-label flex-1 font-sans text-sm font-medium {d.spent > 0 ? 'text-foreground' : 'text-muted-foreground'}">{d.c.label}</span>
          <span class="cat-pct font-mono tabular-nums text-[11px] text-muted-foreground min-w-[38px] text-right">
            {d.pct.toFixed(1)}%
          </span>
          <div class="shrink-0 text-right min-w-[84px]"><Money value={d.spent} size={14} weight={600} negColor={false} /></div>
        </div>
        <div class="mt-2 ml-5 flex items-center gap-2">
          <div class="cat-bar-track flex-1 h-1 rounded-[2px] overflow-hidden" style="background: {darkMode.current ? d.c.soft : d.c.pastel};">
            <div
              class="cat-bar-fill h-full rounded-[2px] transition-[width] duration-[600ms] ease-[cubic-bezier(.2,.7,.2,1)]"
              style="width: {barWidth(d.spent)}%; background: {darkMode.current ? d.c.darkColor : d.c.color}; transition-delay: {i * 40}ms;"
            ></div>
          </div>
          <span class="font-mono tabular-nums text-[10px] text-muted-foreground shrink-0 {store.masterLoading ? 'opacity-50' : ''}">
            {peso(d.budget, store.config.currency)} left
          </span>
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
