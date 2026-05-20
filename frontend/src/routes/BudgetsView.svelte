<script lang="ts">
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { onMount } from 'svelte';
  import { store } from '../lib/store.svelte';
  import { CATEGORIES, CATEGORY_ORDER } from '../lib/theme';
  import { peso } from '../lib/format';
  import Money from '../components/Money.svelte';
  import SectionHeader from '../components/SectionHeader.svelte';

  const now = new Date();
  const monthLabel = now.toLocaleString('en-PH', { month: 'long', year: 'numeric' });

  const totalOutgoing = $derived(
    store.entries
      .filter(e => e.direction === 'O')
      .reduce((s, e) => s + e.amount, 0)
  );

  const categoryData = $derived(
    CATEGORY_ORDER.map((key) => {
      const c = CATEGORIES[key];
      const budget = store.master.budgets[key] ?? 0;
      const spent = store.entries
        .filter(e => e.direction === 'O' && e.mainCategory === key)
        .reduce((s, e) => s + e.amount, 0);
      const pct = totalOutgoing > 0 ? (spent / totalOutgoing) * 100 : 0;
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

<div class="summary-view" style="padding-bottom: 72px;">
  <!-- Page header -->
  <div class="page-header">
    <div class="month-label">{monthLabel.toUpperCase()}</div>
    <div class="page-title">Summary</div>
  </div>

  <!-- On Hand card -->
  <div class="onhand-card">
    <div class="onhand-left">
      <div class="card-label">On Hand</div>
      <div class="onhand-amount" style="font-family: var(--font-mono); font-variant-numeric: tabular-nums;">
        {peso(store.master.onHand)}
      </div>
    </div>
    <div class="onhand-right">
      <div class="card-label">Total Spent</div>
      <Money value={totalOutgoing} size={17} weight={500} negColor={false} dim />
    </div>
  </div>

  <!-- Distribution bar -->
  <SectionHeader>
    {#snippet children()}Distribution{/snippet}
  </SectionHeader>
  <div class="dist-bar-wrap">
    <div class="dist-bar">
      {#each categoryData as d}
        <div
          class="dist-segment"
          title="{d.c.label}: {peso(d.spent)}"
          style="
            flex: {d.spent || 0.01};
            background: {d.c.color};
            opacity: {d.spent > 0 ? 1 : 0.15};
          "
        ></div>
      {/each}
    </div>
    <!-- legend dots -->
    <div class="dist-legend">
      {#each categoryData.filter(d => d.spent > 0) as d}
        <span class="legend-item">
          <span class="legend-dot" style="background: {d.c.color};"></span>
          {d.c.label}
        </span>
      {/each}
    </div>
  </div>

  <!-- By Category breakdown -->
  <SectionHeader>
    {#snippet children()}By Category{/snippet}
  </SectionHeader>
  <div class="cat-list">
    {#each categoryData.sort((a, b) => b.spent - a.spent) as d, i}
      <div
        class="cat-row"
        style="border-bottom: {i < categoryData.length - 1 ? '1px solid var(--border)' : 'none'};"
      >
        <div class="cat-row-main">
          <span class="cat-dot" style="background: {d.c.color}; box-shadow: 0 0 8px {d.c.color}55;"></span>
          <span class="cat-label">{d.c.label}</span>
          <span class="cat-pct" style="font-family: var(--font-mono); font-variant-numeric: tabular-nums;">
            {d.pct.toFixed(1)}%
          </span>
          <Money value={d.spent} size={14} weight={500} negColor={false} />
        </div>
        <!-- animated bar -->
        <div class="cat-bar-track">
          <div
            class="cat-bar-fill"
            style="
              width: {$barWidths[d.key] ?? 0}%;
              background: {d.c.color};
              box-shadow: 0 0 6px {d.c.color}44;
            "
          ></div>
        </div>
        <!-- Budget label -->
        <div class="cat-budget-label">
          Budget: <span style="
            font-family: var(--font-mono);
            font-variant-numeric: tabular-nums;
            color: {d.budget < 0 ? 'var(--destructive)' : 'var(--positive)'};
            font-weight: 500;
          ">{peso(d.budget)}</span>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .summary-view { padding: 0; }

  .page-header {
    padding: 20px 20px 4px;
  }
  .month-label {
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: var(--muted-foreground);
  }
  .page-title {
    font-family: var(--font-sans);
    font-size: 28px;
    font-weight: 600;
    color: var(--foreground);
    margin-top: 2px;
    letter-spacing: -0.5px;
  }

  .onhand-card {
    margin: 14px 16px 0;
    padding: 18px 22px;
    border-radius: var(--radius-lg);
    background: var(--card);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .card-label {
    font-size: 11px;
    font-family: var(--font-sans);
    font-weight: 600;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: var(--muted-foreground);
  }
  .onhand-amount {
    margin-top: 4px;
    font-size: 26px;
    font-weight: 500;
    color: var(--foreground);
    letter-spacing: -0.6px;
  }
  .onhand-right {
    text-align: right;
    margin-top: 4px;
  }

  .dist-bar-wrap {
    margin: 0 16px;
  }
  .dist-bar {
    display: flex;
    height: 14px;
    border-radius: 8px;
    overflow: hidden;
    background: var(--muted);
  }
  .dist-segment {
    transition: flex 500ms cubic-bezier(.2,.7,.2,1);
  }
  .dist-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 14px;
    margin-top: 10px;
  }
  .legend-item {
    display: flex;
    align-items: center;
    gap: 5px;
    font-family: var(--font-sans);
    font-size: 11px;
    color: var(--muted-foreground);
    font-weight: 500;
  }
  .legend-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .cat-list {
    margin: 0 16px;
    border-radius: var(--radius-lg);
    background: var(--card);
    border: 1px solid var(--border);
    overflow: hidden;
  }
  .cat-row {
    padding: 14px 16px;
  }
  .cat-row-main {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .cat-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .cat-label {
    flex: 1;
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 500;
    color: var(--foreground);
  }
  .cat-pct {
    font-size: 11px;
    color: var(--muted-foreground);
    min-width: 38px;
    text-align: right;
  }

  .cat-bar-track {
    margin-top: 8px;
    margin-left: 20px;
    height: 4px;
    background: var(--muted);
    border-radius: 2px;
    overflow: hidden;
  }
  .cat-bar-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 600ms cubic-bezier(.2,.7,.2,1);
  }

  .cat-budget-label {
    margin-top: 5px;
    margin-left: 20px;
    font-family: var(--font-sans);
    font-size: 11px;
    color: var(--muted-foreground);
  }
</style>
