<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { CATEGORIES, CATEGORY_ORDER } from '../lib/theme';
  import { peso, fmtDate, dayOfWeek, currentYearMonth, yearMonth } from '../lib/format';
  import Money from '../components/Money.svelte';
  import SectionHeader from '../components/SectionHeader.svelte';
  import TagPill from '../components/TagPill.svelte';

  interface Props {
    onnavigate: (tab: 'entries' | 'summary') => void;
  }

  let { onnavigate }: Props = $props();

  const now = new Date();
  const monthLabel = now.toLocaleString('en-PH', { month: 'long', year: 'numeric' });
  const ym = currentYearMonth();

  const outgoingEntries = $derived(store.entries.filter(e => e.direction === 'O'));

  const thisMonthTotal = $derived(
    outgoingEntries
      .filter(e => yearMonth(e.date) === ym)
      .reduce((s, e) => s + e.amount, 0)
  );

  const allTotal = $derived(outgoingEntries.reduce((s, e) => s + e.amount, 0));

  // Latest day with outgoing entries
  const latestDate = $derived(
    outgoingEntries.length > 0
      ? outgoingEntries.reduce((max, e) => e.date > max ? e.date : max, outgoingEntries[0].date)
      : null
  );

  const todayEntries = $derived(
    latestDate
      ? store.entries.filter(e => e.direction === 'O' && e.date === latestDate)
      : []
  );

  const latestLabel = $derived(
    latestDate
      ? `${dayOfWeek(latestDate)}, ${fmtDate(latestDate)}`
      : 'Today'
  );
</script>

<div class="home" style="padding-bottom: 72px;">
  <!-- Month header -->
  <div class="page-header">
    <div class="month-label">{monthLabel.toUpperCase()}</div>
    <div class="greeting">On Hand</div>
  </div>

  <!-- On Hand hero card -->
  <div class="hero-card">
    <div class="hero-glow"></div>
    <div class="hero-onhand-label">ON HAND</div>
    <div class="hero-amount" style="font-family: var(--font-mono); font-variant-numeric: tabular-nums;">
      {peso(store.master.onHand)}
    </div>
    <div class="hero-divider"></div>
    <div class="hero-stats">
      <div class="hero-stat">
        <div class="stat-label">This Month</div>
        <div class="stat-value" style="font-family: var(--font-mono); font-variant-numeric: tabular-nums;">
          {peso(thisMonthTotal)}
        </div>
      </div>
      <div class="hero-stat-divider"></div>
      <div class="hero-stat">
        <div class="stat-label">All Total</div>
        <div class="stat-value" style="font-family: var(--font-mono); font-variant-numeric: tabular-nums;">
          {peso(allTotal)}
        </div>
      </div>
    </div>
  </div>

  <!-- By Category pills -->
  <SectionHeader>
    {#snippet children()}By Category{/snippet}
    {#snippet right()}
      <button class="see-all" onclick={() => onnavigate('summary')}>See all →</button>
    {/snippet}
  </SectionHeader>

  <div class="category-scroll">
    {#each CATEGORY_ORDER as key}
      {@const c = CATEGORIES[key]}
      {@const budget = store.master.budgets[key] ?? 0}
      <div class="cat-chip" style="border: 1px solid var(--border);">
        <div class="cat-chip-header">
          <span class="cat-dot" style="background: {c.color}; box-shadow: 0 0 6px {c.color}55;"></span>
          <span class="cat-name" style="color: var(--muted-foreground);">{c.label}</span>
        </div>
        <div class="cat-amount" style="font-family: var(--font-mono); font-variant-numeric: tabular-nums; color: {budget < 0 ? 'var(--destructive)' : 'var(--foreground)'};">
          {peso(budget)}
        </div>
      </div>
    {/each}
  </div>

  <!-- Latest-day outgoing -->
  <SectionHeader>
    {#snippet children()}Latest · {latestLabel}{/snippet}
    {#snippet right()}
      <button class="see-all" onclick={() => onnavigate('entries')}>All entries →</button>
    {/snippet}
  </SectionHeader>

  <div class="today-list">
    {#if todayEntries.length === 0}
      <div class="empty">No outgoing entries yet.</div>
    {:else}
      {#each todayEntries as entry, i}
        {@const c = CATEGORIES[entry.mainCategory]}
        <div
          class="today-row"
          style="
            border-bottom: {i < todayEntries.length - 1 ? '1px solid var(--border)' : 'none'};
            opacity: {entry.amount === 0 ? 0.5 : 1};
          "
        >
          <div class="row-bar" style="background: {c?.color ?? 'var(--muted-foreground)'}; box-shadow: 0 0 6px {c?.color ?? 'transparent'}33;"></div>
          <div class="row-body">
            <div class="row-desc">{entry.description}</div>
            <div class="row-meta">
              <TagPill tag={entry.tag} direction={entry.direction} mainCategory={entry.mainCategory} small />
            </div>
          </div>
          <Money value={entry.amount} size={15} weight={500} dim={entry.amount === 0} negColor={false} />
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .home { padding: 0; }

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
  .greeting {
    font-family: var(--font-sans);
    font-size: 28px;
    font-weight: 600;
    color: var(--foreground);
    margin-top: 2px;
    letter-spacing: -0.5px;
  }

  .hero-card {
    margin: 14px 16px 0;
    padding: 20px 22px 22px;
    border-radius: var(--radius-xl);
    background: linear-gradient(155deg, #f0faf4 0%, #d6f0e0 100%);
    border: 1px solid rgba(52, 168, 83, 0.2);
    position: relative;
    overflow: hidden;
  }
  .hero-glow {
    position: absolute;
    top: -40px;
    right: -40px;
    width: 160px;
    height: 160px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(52,168,83,0.18), transparent 60%);
    pointer-events: none;
  }
  .hero-onhand-label {
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: var(--muted-foreground);
  }
  .hero-amount {
    font-size: 38px;
    font-weight: 500;
    color: var(--foreground);
    letter-spacing: -1.2px;
    margin-top: 4px;
  }
  .hero-divider {
    height: 1px;
    background: var(--border);
    margin: 18px 0 16px;
  }
  .hero-stats {
    display: flex;
    gap: 22px;
    align-items: center;
  }
  .hero-stat-divider {
    width: 1px;
    height: 28px;
    background: var(--border);
  }
  .stat-label {
    font-size: 10px;
    color: var(--muted-foreground);
    letter-spacing: 0.8px;
    text-transform: uppercase;
    font-family: var(--font-sans);
    font-weight: 600;
  }
  .stat-value {
    margin-top: 4px;
    font-size: 17px;
    color: var(--foreground);
    font-weight: 500;
  }

  .see-all {
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 500;
    color: var(--accent);
  }

  .category-scroll {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 0 16px 4px;
    scrollbar-width: none;
  }
  .cat-chip {
    flex-shrink: 0;
    padding: 10px 14px;
    border-radius: var(--radius-md);
    background: var(--card);
    min-width: 96px;
  }
  .cat-chip-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .cat-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .cat-name {
    font-size: 11px;
    font-family: var(--font-sans);
    font-weight: 600;
    letter-spacing: 0.3px;
  }
  .cat-amount {
    margin-top: 4px;
    font-size: 13px;
    font-weight: 500;
  }

  .today-list {
    margin: 0 16px;
    border-radius: var(--radius-lg);
    background: var(--card);
    border: 1px solid var(--border);
    overflow: hidden;
  }
  .empty {
    padding: 20px;
    text-align: center;
    color: var(--muted-foreground);
    font-size: 14px;
    font-family: var(--font-sans);
  }
  .today-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
  }
  .row-bar {
    width: 4px;
    height: 36px;
    border-radius: 2px;
    flex-shrink: 0;
  }
  .row-body {
    flex: 1;
    min-width: 0;
  }
  .row-desc {
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 500;
    color: var(--foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row-meta {
    margin-top: 2px;
  }
</style>
