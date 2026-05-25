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

<div class="home p-0" style="padding-bottom: 72px;">
  <!-- Month header -->
  <div class="page-header">
    <div class="page-eyebrow">{monthLabel.toUpperCase()}</div>
    <div class="page-title">On Hand</div>
  </div>

  <div class="home-cols md:grid md:grid-cols-[3fr_2fr] md:items-start">
    <!-- Left: hero + latest -->
    <div class="home-left">
      <!-- On Hand hero card -->
      <div class="hero-card card mx-4 mt-[14px] pt-5 pb-5 px-[22px]">
        <div class="card-label">ON HAND</div>
        <div class="hero-amount mono-amount text-[44px] font-medium text-foreground tracking-[-1.2px] mt-1" class:shimmer={store.masterLoading}>
          {peso(store.master.onHand)}
        </div>
        <div class="hero-divider h-px bg-border mt-[18px] mb-4"></div>
        <div class="hero-stats flex gap-[22px] items-center">
          <div class="hero-stat">
            <div class="stat-label font-display text-[10px] text-muted-foreground tracking-[0.8px] uppercase font-semibold">This Month</div>
            <div class="stat-value mono-amount mt-1 text-[17px] text-foreground font-medium">{peso(thisMonthTotal)}</div>
          </div>
          <div class="hero-stat-divider w-px h-7 bg-border"></div>
          <div class="hero-stat">
            <div class="stat-label font-display text-[10px] text-muted-foreground tracking-[0.8px] uppercase font-semibold">All Total</div>
            <div class="stat-value mono-amount mt-1 text-[17px] text-foreground font-medium">{peso(allTotal)}</div>
          </div>
        </div>
      </div>

      <!-- Latest-day outgoing -->
      <SectionHeader>
        {#snippet children()}Latest · {latestLabel}{/snippet}
        {#snippet right()}
          <button class="see-all bg-transparent border-0 p-0 cursor-pointer font-sans text-[13px] font-medium text-accent" onclick={() => onnavigate('entries')}>All entries →</button>
        {/snippet}
      </SectionHeader>

      <button class="today-teaser block w-full bg-transparent border-0 p-0 cursor-pointer text-left" onclick={() => onnavigate('entries')} aria-label="Go to entries">
        <div class="today-section mx-4 rounded-[var(--radius-lg)] shadow-[var(--shadow-card)]">
        <!-- Blurred teaser card — no real content, just a shape -->
        <div class="teaser-wrap h-[10px] overflow-hidden" aria-hidden="true">
          <div class="teaser-card h-12 bg-card rounded-none border-b border-border translate-y-[calc(-100%+10px)]"></div>
        </div>

        {#if todayEntries.length === 0}
          <div class="empty p-5 text-center text-muted-foreground text-sm font-sans">No entries yet.</div>
        {:else}
          <div class="today-card rounded-b-[var(--radius-lg)] rounded-t-none bg-card overflow-hidden">
            {#each todayEntries as entry, i (entry.id)}
              {@const dim = entry.amount === 0}
              {@const catStyle = CATEGORIES[entry.mainCategory] ?? { pastel: 'var(--muted)', color: 'var(--muted-foreground)' }}
              <div
                class="today-row flex items-center gap-[10px] py-3 pr-3 pl-[14px]"
                class:opacity-[0.55]={dim}
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
    <div class="home-right md:border-l md:border-border md:min-h-full">
      <SectionHeader>
        {#snippet children()}By Category{/snippet}
        {#snippet right()}
          <button class="see-all bg-transparent border-0 p-0 cursor-pointer font-sans text-[13px] font-medium text-accent" onclick={() => onnavigate('summary')}>See all →</button>
        {/snippet}
      </SectionHeader>

      <div class="category-scroll-wrap overflow-x-auto pb-[10px] -mb-[10px] md:overflow-x-visible md:pb-2 md:mb-0">
      <div class="category-scroll flex gap-2 py-[2px] pl-4 md:grid md:grid-cols-[repeat(auto-fill,minmax(90px,1fr))] md:px-4 md:py-[2px]">
        {#each CATEGORY_ORDER as key}
          {@const c = CATEGORIES[key]}
          {@const budget = store.master.budgets[key] ?? 0}
          <div class="cat-chip shrink-0 py-[10px] px-[14px] rounded-[var(--radius-md)] min-w-[96px] bg-card shadow-[var(--shadow-card)] md:shrink">
            <div class="cat-chip-header flex items-center gap-[6px]">
              <span class="cat-dot size-2 rounded-full shrink-0" style="background: {c.color}cc;"></span>
              <span class="cat-name font-display text-[11px] font-semibold tracking-[0.3px] text-muted-foreground">{c.label}</span>
            </div>
            <div class="cat-amount font-mono tabular-nums mt-1 text-[13px] font-medium" class:shimmer={store.masterLoading} style="color: {budget < 0 ? 'var(--destructive)' : 'var(--foreground)'};">
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
  .category-scroll::after {
    content: '';
    flex-shrink: 0;
    width: 8px;
  }
  @media (min-width: 768px) {
    .category-scroll::after { display: none; }
  }
</style>
