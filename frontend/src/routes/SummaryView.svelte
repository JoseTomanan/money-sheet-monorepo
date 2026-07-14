<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { CATEGORIES, CATEGORY_ORDER } from '../lib/theme';
  import { darkMode } from '../lib/darkMode.svelte';
  import Money from '../components/ui/Money.svelte';
  import SectionHeader from '../components/ui/SectionHeader.svelte';
  import PaceChart from '../components/charts/PaceChart.svelte';

  interface Props {
    ondeeper: () => void;
  }

  let { ondeeper }: Props = $props();

  // "Low" balance heuristic: categories here have no configurable goal/target
  // yet, so a flat peso threshold stands in until a future slice adds one.
  // Chosen to flag categories running thin without firing on every small dip.
  const LOW_BALANCE_THRESHOLD = 1000;

  const envelopes = $derived(
    CATEGORY_ORDER.map((key) => {
      const balance = store.master.budgets[key] ?? 0;
      const change = store.stats.categoryMonthChange.find((c) => c.category === key);
      return {
        key,
        c: CATEGORIES[key],
        balance,
        netChange: change?.netChange ?? 0,
        negative: balance < 0,
        low: balance >= 0 && balance < LOW_BALANCE_THRESHOLD,
      };
    })
  );

  // Spending pace: this calendar month's cumulative outgoing vs the
  // trailing-months "usual" band, both computed sheet-side (STATS).
  const spendingPace = $derived(store.stats.spendingPace);
  const current = $derived(spendingPace.map((d) => d.cumulativeThisMonth));
  const usual = $derived(spendingPace.map((d) => d.cumulativeUsual));

  // "Latest populated day" for the headline: today's day-of-month, capped to
  // the length of the sheet-provided series. Reading the clock is display
  // formatting, not a derived financial metric.
  const upToDay = $derived(Math.min(new Date().getDate(), spendingPace.length || 1));
  const latestDay = $derived(spendingPace[upToDay - 1] ?? spendingPace[spendingPace.length - 1] ?? null);

  const paceDeltaPct = $derived(
    latestDay && latestDay.cumulativeUsual > 0
      ? ((latestDay.cumulativeThisMonth - latestDay.cumulativeUsual) / latestDay.cumulativeUsual) * 100
      : null
  );
  const paceHeadline = $derived(
    paceDeltaPct === null
      ? null
      : paceDeltaPct >= 0
        ? `+${paceDeltaPct.toFixed(0)}% faster than usual`
        : `${Math.abs(paceDeltaPct).toFixed(0)}% slower than usual`
  );
</script>

<div class="summary-view p-0 pb-[72px]">
{#if store.loading}
  <!-- Skeleton -->
  <div class="page-header px-5 pt-5 pb-1">
    <div class="h-[10px] w-[100px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
    <div class="h-[28px] w-[160px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite] mt-[6px]"></div>
  </div>
  <div class="card mx-4 mt-[14px] overflow-hidden">
    {#each [0, 1, 2, 3, 4, 5, 6] as i (i)}
      <div class="py-4 px-4 border-b border-border last:border-0 flex items-center justify-between">
        <div class="flex items-center gap-[10px]">
          <div class="size-[10px] rounded-full bg-border animate-[shimmer_1s_ease-in-out_infinite] shrink-0"></div>
          <div class="h-[14px] w-[90px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
        </div>
        <div class="h-[18px] w-[80px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
      </div>
    {/each}
  </div>
  <div class="px-5 pt-[14px] pb-2">
    <div class="h-[10px] w-[100px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
  </div>
  <div class="card mx-4 p-4">
    <div class="h-[110px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
  </div>
{:else}
  <!-- Page header -->
  <div class="page-header px-5 pt-5 pb-1 flex items-end justify-between">
    <div>
      <div class="page-eyebrow font-display text-xs font-semibold tracking-[1.2px] uppercase text-muted-foreground">Funds health</div>
      <div class="page-title font-display text-[28px] font-bold text-foreground mt-[2px] tracking-[-0.5px]">Summary</div>
    </div>
    <button
      class="deeper-stats-link bg-transparent border-0 cursor-pointer font-sans text-[13px] font-medium text-accent pb-1 flex items-center gap-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent rounded-[var(--radius-sm)]"
      aria-label="Deeper statistics"
      onclick={ondeeper}
    >
      Deeper stats
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
    </button>
  </div>

  <!-- Envelope rows: one per Category. Balance is the anchor number. -->
  <div class="envelope-list card mx-4 mt-[14px] overflow-hidden">
    {#each envelopes as e (e.key)}
      <div
        class="envelope-row flex items-center justify-between gap-3 py-4 px-4 border-b border-border last:border-b-0 relative"
        class:bg-[var(--destructive-tint-bg)]={e.negative}
      >
        {#if e.low}
          <span class="low-marker absolute left-0 top-2 bottom-2 w-[2px] rounded-full bg-muted-foreground/40" aria-hidden="true"></span>
        {/if}
        <div class="flex items-center gap-[10px] min-w-0">
          <span class="cat-dot size-[6px] rounded-full shrink-0" style="background: {darkMode.current ? e.c.darkDot : e.c.dot};"></span>
          <span class="cat-label font-sans text-sm font-medium text-foreground truncate">{e.c.label}</span>
          {#if e.low}
            <span class="low-label font-sans text-[10px] font-medium text-muted-foreground shrink-0">Low</span>
          {/if}
        </div>
        <div class="text-right shrink-0">
          <Money value={e.balance} size={20} weight={700} />
          <div class="direction-chip flex items-center justify-end gap-1 mt-[2px]">
            {#if e.netChange > 0}
              <span class="font-sans text-[10px] text-positive" aria-hidden="true">▲</span>
            {:else if e.netChange < 0}
              <span class="font-sans text-[10px] text-destructive" aria-hidden="true">▼</span>
            {:else}
              <span class="font-sans text-[10px] text-muted-foreground" aria-hidden="true">–</span>
            {/if}
            <Money value={e.netChange} size={11} weight={500} />
          </div>
        </div>
      </div>
    {/each}
  </div>

  <!-- Spending pace: this month's cumulative spend vs the trailing-months average. -->
  <SectionHeader>
    Spending pace
    {#snippet right()}
      {#if paceHeadline}
        <span
          class="font-mono tabular-nums text-[11px] font-semibold"
          style="color: {paceDeltaPct !== null && paceDeltaPct > 0 ? 'var(--destructive)' : 'var(--positive)'};"
        >{paceHeadline}</span>
      {/if}
    {/snippet}
  </SectionHeader>
  <div class="card mx-4 px-4 pt-3 pb-3">
    <PaceChart
      {current}
      previous={usual}
      {upToDay}
      curLabel="This month"
      prevLabel="Usual"
    />
  </div>
{/if}
</div>
