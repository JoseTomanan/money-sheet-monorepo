<script lang="ts">
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { onMount } from 'svelte';
  import { store } from '../lib/store.svelte';
  import { CATEGORIES, CATEGORY_ORDER } from '../lib/theme';
  import { peso } from '../lib/format';
  import { totalOutgoing, outgoingByCategory } from '../lib/aggregations';
  import Money from '../components/Money.svelte';
  import SectionHeader from '../components/SectionHeader.svelte';

  const now = new Date();
  const monthLabel = now.toLocaleString('en-PH', { month: 'long', year: 'numeric' });

  const spendTotal = $derived(totalOutgoing(store.entries));
  const spendByCategory = $derived(outgoingByCategory(store.entries));

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
  <!-- Page header -->
  <div class="page-header">
    <div class="page-eyebrow">{monthLabel.toUpperCase()}</div>
    <div class="page-title">Summary</div>
  </div>

  <!-- On Hand card -->
  <div class="onhand-card card mx-4 mt-[14px] pt-5 pb-5 px-[22px] flex items-center justify-between">
    <div class="onhand-left">
      <div class="card-label">On Hand</div>
      <div class="onhand-amount mono-amount mt-1 text-[26px] font-medium text-foreground tracking-[-0.6px]" class:shimmer={store.masterLoading}>
        {peso(store.master.onHand)}
      </div>
    </div>
    <div class="onhand-right text-right mt-1">
      <div class="card-label">Total Spent</div>
      <Money value={spendTotal} size={17} weight={500} negColor={false} dim />
    </div>
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
          title="{d.c.label}: {peso(d.spent)}"
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
          <span class="legend-dot size-[6px] rounded-full shrink-0" style="background: {d.c.color};"></span>
          {d.c.label} {d.pct.toFixed(1)}%
        </span>
      {/each}
    </div>
  </div>

  <!-- By Category breakdown -->
  <SectionHeader>
    {#snippet children()}By Category{/snippet}
  </SectionHeader>
  <div class="cat-list card mx-4 overflow-hidden md:grid md:grid-cols-2">
    {#each categoryData.sort((a, b) => b.spent - a.spent) as d, i}
      <div
        class="cat-row py-[14px] px-4 md:border-b md:border-border"
        style="border-bottom: {i < categoryData.length - 1 ? '1px solid var(--border)' : 'none'};"
      >
        <div class="cat-row-main flex items-center gap-[10px]">
          <span class="cat-dot size-[10px] rounded-full shrink-0" style="background: {d.c.color}cc;"></span>
          <span class="cat-label flex-1 font-sans text-sm font-medium text-foreground">{d.c.label}</span>
          <span class="cat-pct mono-amount text-[11px] text-muted-foreground min-w-[38px] text-right">
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
</div>

<style>
  .dist-segment--zero {
    flex: none;
    width: 2px;
    opacity: 1;
  }
</style>
