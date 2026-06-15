<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { CATEGORIES, CATEGORY_ORDER } from '../lib/theme';
  import { darkMode } from '../lib/darkMode.svelte';
  import { peso, fmtDate, dayOfWeek } from '../lib/format';
  import { compareEntriesForDisplay, splitRunPositions } from '../lib/groupEntries';
  import SectionHeader from '../components/SectionHeader.svelte';
  import EntryRow from '../components/EntryRow.svelte';

  interface Props {
    onnavigate: (tab: 'entries' | 'summary') => void;
  }

  let { onnavigate }: Props = $props();

  const now = new Date();
  const monthLabel = now.toLocaleString('en-PH', { month: 'long', year: 'numeric' });

  const latestDate = $derived(
    store.entries.length > 0
      ? store.entries.reduce((max, e) => e.date > max ? e.date : max, store.entries[0].date)
      : null
  );

  const allSorted = $derived(
    [...store.entries].sort(compareEntriesForDisplay)
  );

  const todayEntries = $derived(allSorted.slice(-2));
  const todaySplitPos = $derived(splitRunPositions(todayEntries));

  const latestLabel = $derived(
    latestDate
      ? `${dayOfWeek(latestDate)}, ${fmtDate(latestDate)}`
      : 'Today'
  );

  const greeting = $derived(
    store.config.nickname ? `Hi, ${store.config.nickname}.` : 'Hi!'
  );
</script>

<div class="home p-0" style="padding-bottom: 72px;">
{#if store.loading}
  <!-- Skeleton -->
  <div class="page-header px-5 pt-5 pb-1">
    <div class="h-[10px] w-[100px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
    <div class="h-[36px] w-[200px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite] mt-[6px]"></div>
  </div>
  <div class="home-cols md:grid md:grid-cols-[3fr_2fr] md:items-start">
    <div class="home-left">
      <div class="hero-card bg-card rounded-[var(--radius-lg)] shadow-[var(--shadow-card)] mx-4 mt-[14px] pt-5 pb-5 px-[22px]">
        <div class="h-[8px] w-[60px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
        <div class="h-[44px] w-[180px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite] mt-2"></div>
      </div>
      <div class="px-5 pt-5 pb-2">
        <div class="h-[10px] w-[120px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
      </div>
      <div class="mx-4 rounded-[var(--radius-lg)] bg-card shadow-[var(--shadow-card)] overflow-hidden">
        {#each [0, 1] as _}
          <div class="flex items-center gap-3 py-3 px-[14px] border-b border-border last:border-0">
            <div class="h-[10px] w-[40px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite] shrink-0"></div>
            <div class="h-[14px] flex-1 rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
            <div class="h-[14px] w-[56px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite] shrink-0"></div>
          </div>
        {/each}
      </div>
    </div>
    <div class="home-right md:border-l md:border-border md:min-h-full">
      <div class="px-5 pt-5 pb-2">
        <div class="h-[10px] w-[100px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
      </div>
      <div class="flex gap-2 pl-4 py-[2px]">
        {#each [0, 1, 2, 3, 4] as _}
          <div class="h-[60px] w-[96px] shrink-0 rounded-[var(--radius-md)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
        {/each}
      </div>
    </div>
  </div>
{:else}
  <!-- Month header -->
  <div class="page-header px-5 pt-5 pb-1">
    <div class="page-eyebrow font-display text-xs font-semibold tracking-[1.2px] uppercase text-muted-foreground">{monthLabel.toUpperCase()}</div>
    <div class="page-title font-display text-[36px] font-bold text-foreground mt-[2px] tracking-[-0.5px]">{greeting}</div>
  </div>

  <div class="home-cols md:grid md:grid-cols-[3fr_2fr] md:items-start">
    <!-- Left: hero + latest -->
    <div class="home-left">
      <!-- On Hand hero card -->
      <div class="hero-card bg-card rounded-[var(--radius-lg)] mx-4 mt-[14px] pt-5 pb-5 px-[22px] relative overflow-hidden"
        style="box-shadow: var(--shadow-hero), var(--ring-inset);">
        <div class="card-label font-display text-[11px] font-semibold tracking-[1.2px] uppercase text-muted-foreground">ON HAND</div>
        <div
          class="hero-amount font-mono tabular-nums text-[44px] font-medium text-foreground tracking-[-1.2px] mt-1 text-right"
          class:animate-[shimmer_1s_ease-in-out_infinite]={store.masterLoading}
          class:opacity-40={store.masterLoading}
        >
          {peso(store.master.onHand, store.config.currency)}
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
        <div class="today-section mx-4 rounded-[var(--radius-lg)] shadow-[var(--shadow-card)] bg-card overflow-hidden">
        {#if todayEntries.length === 0}
          <div class="empty p-5 text-center text-muted-foreground text-sm font-sans">No entries yet.</div>
        {:else}
          {#each todayEntries as entry, i (entry.id)}
            <div
              class="today-row flex items-center gap-[10px] py-3 pr-3 pl-3"
              style="border-top: {i === 0 ? 'none' : '1px solid var(--border)'};"
            >
              <EntryRow {entry} splitPos={todaySplitPos[i]} />
            </div>
          {/each}
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
          <div class="cat-chip shrink-0 py-[10px] px-[14px] rounded-[var(--radius-md)] min-w-[96px] md:shrink"
            style="background: {darkMode.current ? c.soft : c.pastel}; border: 1px solid color-mix(in srgb, {darkMode.current ? c.darkDot : c.dot} 50%, transparent); box-shadow: var(--shadow-card);">
            <div class="cat-chip-header flex items-center gap-[6px]">
              <span class="cat-dot size-2 rounded-full shrink-0" style="background: {darkMode.current ? c.darkDot : c.dot};"></span>
              <span class="cat-name font-display text-[11px] font-semibold tracking-[0.3px] text-muted-foreground">{c.label}</span>
            </div>
            <div
              class="cat-amount font-mono tabular-nums mt-1 text-[13px] font-medium text-right"
              class:animate-[shimmer_1s_ease-in-out_infinite]={store.masterLoading}
              class:opacity-40={store.masterLoading}
              style="color: {c.color};"
            >
              {peso(budget, store.config.currency)}
            </div>
          </div>
        {/each}
      </div>
      </div>
    </div>
  </div>
{/if}
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
