<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { CATEGORIES, CATEGORY_ORDER } from '../lib/theme';
  import { peso, fmtDate, fmtDateShort, dayOfWeek, currentYearMonth } from '../lib/format';
  import { totalOutgoing, outgoingByMonth } from '../lib/aggregations';
  import { dateRunPositions } from '../lib/groupEntries';
  import Money from '../components/Money.svelte';
  import SectionHeader from '../components/SectionHeader.svelte';
  import EntryDescBand from '../components/EntryDescBand.svelte';

  interface Props {
    onnavigate: (tab: 'entries' | 'summary') => void;
  }

  let { onnavigate }: Props = $props();

  const now = new Date();
  const monthLabel = now.toLocaleString('en-PH', { month: 'long', year: 'numeric' });
  const ym = currentYearMonth();

  const thisMonthTotal = $derived(outgoingByMonth(store.entries, ym));
  const allTotal = $derived(totalOutgoing(store.entries));

  const latestDate = $derived(
    store.entries.length > 0
      ? store.entries.reduce((max, e) => e.date > max ? e.date : max, store.entries[0].date)
      : null
  );

  const allSorted = $derived(
    [...store.entries].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
  );

  const todayEntries = $derived(allSorted.slice(-2));
  const todayPositions = $derived(dateRunPositions(todayEntries));

  const latestLabel = $derived(
    latestDate
      ? `${dayOfWeek(latestDate)}, ${fmtDate(latestDate)}`
      : 'Today'
  );
</script>

<div class="home" style="padding-bottom: 72px;">
  <!-- Month header -->
  <div class="page-header">
    <div class="page-eyebrow">{monthLabel.toUpperCase()}</div>
    <div class="page-title">On Hand</div>
  </div>

  <div class="home-cols">
    <!-- Left: hero + latest -->
    <div class="home-left">
      <!-- On Hand hero card -->
      <div class="hero-card card">
        <div class="card-label">ON HAND</div>
        <div class="hero-amount mono-amount" class:shimmer={store.masterLoading}>
          {peso(store.master.onHand)}
        </div>
        <div class="hero-divider"></div>
        <div class="hero-stats">
          <div class="hero-stat">
            <div class="stat-label">This Month</div>
            <div class="stat-value mono-amount">{peso(thisMonthTotal)}</div>
          </div>
          <div class="hero-stat-divider"></div>
          <div class="hero-stat">
            <div class="stat-label">All Total</div>
            <div class="stat-value mono-amount">{peso(allTotal)}</div>
          </div>
        </div>
      </div>

      <!-- Latest-day outgoing -->
      <SectionHeader>
        {#snippet children()}Latest · {latestLabel}{/snippet}
        {#snippet right()}
          <button class="see-all" onclick={() => onnavigate('entries')}>All entries →</button>
        {/snippet}
      </SectionHeader>

      <button class="today-teaser" onclick={() => onnavigate('entries')} aria-label="Go to entries">
        <div class="today-section">
        <!-- Blurred teaser card — no real content, just a shape -->
        <div class="teaser-wrap" aria-hidden="true">
          <div class="teaser-card"></div>
        </div>

        {#if todayEntries.length === 0}
          <div class="empty">No entries yet.</div>
        {:else}
          <div class="today-card">
            {#each todayEntries as entry, i (entry.id)}
              {@const dim = entry.amount === 0}
              {@const catStyle = CATEGORIES[entry.mainCategory] ?? { pastel: 'var(--muted)', color: 'var(--muted-foreground)' }}
              <div
                class="today-row"
                class:dim
                style="border-top: {todayPositions[i].isFirstOfDate ? 'none' : '1px solid var(--border)'};"
              >
                <span class="entry-date-lead">{fmtDateShort(entry.date)}</span>
                <EntryDescBand description={entry.description} pastel={catStyle.pastel} color={catStyle.color} />
                <div class="entry-amount-wrap">
                  <Money value={entry.amount} size={14} weight={500} negColor={false} positive={entry.direction === 'I'} {dim} />
                </div>
              </div>
            {/each}
          </div>
        {/if}
        </div>
      </button>
    </div>

    <!-- Right: category chips -->
    <div class="home-right">
      <SectionHeader>
        {#snippet children()}By Category{/snippet}
        {#snippet right()}
          <button class="see-all" onclick={() => onnavigate('summary')}>See all →</button>
        {/snippet}
      </SectionHeader>

      <div class="category-scroll-wrap">
      <div class="category-scroll">
        {#each CATEGORY_ORDER as key}
          {@const c = CATEGORIES[key]}
          {@const budget = store.master.budgets[key] ?? 0}
          <div class="cat-chip">
            <div class="cat-chip-header">
              <span class="cat-dot" style="background: {c.color}cc;"></span>
              <span class="cat-name">{c.label}</span>
            </div>
            <div class="cat-amount" class:shimmer={store.masterLoading} style="color: {budget < 0 ? 'var(--destructive)' : 'var(--foreground)'};">
              {peso(budget)}
            </div>
          </div>
        {/each}
      </div>
      </div>
    </div>
  </div>
</div>

<style>
  .home { padding: 0; }

  @media (min-width: 768px) {
    .home-cols {
      display: grid;
      grid-template-columns: 3fr 2fr;
      align-items: start;
    }
    .home-right {
      border-left: 1px solid var(--border);
      min-height: 100%;
    }
  }

  .hero-card {
    margin: 14px 16px 0;
    padding: 20px 22px;
  }
  .hero-amount {
    font-size: 44px;
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
    font-family: var(--font-display);
    font-size: 10px;
    color: var(--muted-foreground);
    letter-spacing: 0.8px;
    text-transform: uppercase;
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

  .category-scroll-wrap {
    overflow-x: auto;
    scrollbar-width: none;
    padding: 0 0 10px;
    margin-bottom: -10px;
  }
  .category-scroll-wrap::-webkit-scrollbar { display: none; }
  .category-scroll {
    display: flex;
    gap: 8px;
    padding: 2px 0 2px 16px;
  }
  .category-scroll::after {
    content: '';
    flex-shrink: 0;
    width: 8px;
  }
  .cat-chip {
    flex-shrink: 0;
    padding: 10px 14px;
    border-radius: var(--radius-md);
    min-width: 96px;
    background: var(--card);
    box-shadow: var(--shadow-card);
  }

  @media (min-width: 768px) {
    .category-scroll-wrap {
      overflow-x: visible;
      padding: 0 0 8px;
      margin-bottom: 0;
    }
    .category-scroll {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
      padding: 2px 16px;
    }
    .category-scroll::after { display: none; }
    .cat-chip { flex-shrink: unset; }
  }
  .cat-chip-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .cat-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .cat-name {
    font-family: var(--font-display);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.3px;
    color: var(--muted-foreground);
  }
  .cat-amount {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
    margin-top: 4px;
    font-size: 13px;
    font-weight: 500;
  }

  .today-teaser {
    display: block;
    width: 100%;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
  }
  .today-section {
    margin: 0 16px;
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
  }
  .teaser-wrap {
    height: 10px;
    overflow: hidden;
  }
  .teaser-card {
    height: 48px;
    background: var(--card);
    border-radius: 0;
    border-bottom: 1px solid var(--border);
    transform: translateY(calc(-100% + 10px));
  }
  .today-card {
    border-radius: 0 0 var(--radius-lg) var(--radius-lg);
    background: var(--card);
    overflow: hidden;
  }
  .today-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 12px 12px 14px;
  }
  .today-row.dim { opacity: 0.55; }
  .empty {
    padding: 20px;
    text-align: center;
    color: var(--muted-foreground);
    font-size: 14px;
    font-family: var(--font-sans);
  }
</style>
