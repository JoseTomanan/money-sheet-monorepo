<script lang="ts">
  import { store } from '../lib/store.svelte';
  import { CATEGORIES, CATEGORY_ORDER } from '../lib/theme';
  import { darkMode } from '../lib/darkMode.svelte';
  import { fmtDate, dayOfWeek } from '../lib/format';
  import { recentForDisplay, splitRunPositions } from '../lib/groupEntries';
  import { latestEntryDate } from '../lib/aggregations';
  import SectionHeader from '../components/ui/SectionHeader.svelte';
  import BalanceStatus from '../components/ui/BalanceStatus.svelte';
  import PageHeader from '../components/ui/PageHeader.svelte';
  import EntryRow from '../components/entry/EntryRow.svelte';
  import Money from '../components/ui/Money.svelte';

  interface Props {
    onnavigate: (tab: 'entries' | 'summary') => void;
    onsettings?: () => void;
  }

  let { onnavigate, onsettings = () => {} }: Props = $props();

  const now = new Date();
  const monthLabel = now.toLocaleString('en-PH', { month: 'long', year: 'numeric' });

  const latestDate = $derived(latestEntryDate(store.entries));

  const todayEntries = $derived(recentForDisplay(store.entries, 2));
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

<div class="home p-0 pb-[72px]">
{#if store.loading || store.hasSnapshot === false}
  <!-- Skeleton -->
  <PageHeader {onsettings}>
    {#snippet context()}<div class="h-[10px] w-[100px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>{/snippet}
    {#snippet title()}<div class="h-[36px] w-[200px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>{/snippet}
  </PageHeader>
  <div class="home-cols grid grid-cols-1 gap-8 px-4 pt-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:px-6" aria-hidden="true">
    <div class="home-left min-w-0">
      <div class="hero-card pb-8">
        <div class="h-[8px] w-[60px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
        <div class="h-[44px] w-[180px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite] mt-2"></div>
      </div>
      <div class="py-3">
        <div class="h-[10px] w-[120px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
      </div>
      <div class="border-y border-border">
        {#each [0, 1] as _}
          <div class="flex items-center gap-3 py-3 px-[14px] border-b border-border last:border-0">
            <div class="h-[10px] w-[40px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite] shrink-0"></div>
            <div class="h-[14px] flex-1 rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
            <div class="h-[14px] w-[56px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite] shrink-0"></div>
          </div>
        {/each}
      </div>
    </div>
    <div class="home-right min-w-0">
      <div class="py-3">
        <div class="h-[10px] w-[100px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
      </div>
      <div class="border-t border-border">
        {#each CATEGORY_ORDER as _}
          <div class="flex justify-between py-3 border-b border-border">
            <div class="h-[21px] w-[96px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
            <div class="h-[21px] w-[64px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
          </div>
        {/each}
      </div>
    </div>
  </div>
{:else}
  <!-- Greeting and date remain secondary to the financial anchor. -->
  <PageHeader {onsettings}>
    {#snippet context()}{monthLabel}{/snippet}
    {#snippet title()}Home{/snippet}
  </PageHeader>
  <p class="mx-4 mt-2 mb-0 text-sm text-muted-foreground lg:mx-6 wrap-anywhere">{greeting}</p>
  <BalanceStatus />
  <div class="home-cols grid grid-cols-1 gap-8 px-4 pt-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start lg:px-6">
    <!-- Primary column: sheet-sourced balance and unchanged latest selection. -->
    <div class="home-left min-w-0">
      <section class="hero-card bg-background text-foreground pb-8" aria-labelledby="on-hand-title">
        <h2 id="on-hand-title" class="m-0 text-sm font-medium text-muted-foreground">On hand</h2>
        <div class="hero-amount mt-2 text-left leading-tight">
          <Money value={store.master.onHand} size={36} />
        </div>
      </section>

      <section aria-labelledby="latest-title">
      <SectionHeader flush>
        {#snippet children()}<h2 id="latest-title" class="m-0 text-sm font-semibold">Latest entries</h2>{/snippet}
        {#snippet right()}
          <button class="see-all control-link" onclick={() => onnavigate('entries')}>All entries</button>
        {/snippet}
      </SectionHeader>
      <p class="m-0 pb-3 text-xs text-muted-foreground">{latestLabel}</p>

      <button class="today-teaser block w-full min-h-11 rounded-[var(--radius-sm)] bg-transparent border-0 p-0 cursor-pointer text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" onclick={() => onnavigate('entries')} aria-label="Go to entries">
        <div class="today-section border-y border-border">
        {#if todayEntries.length === 0}
          <div class="empty p-5 text-center text-muted-foreground text-sm font-sans">No entries yet.</div>
        {:else}
          {#each todayEntries as entry, i (entry.id)}
            <div
              class="today-row flex min-h-11 items-center gap-[10px] py-3 px-3 border-b border-border last:border-0"
            >
              <EntryRow {entry} splitPos={todaySplitPos[i]} local={store.localIds?.has(entry.id) ?? false} />
            </div>
          {/each}
        {/if}
        </div>
      </button>
      </section>
    </div>

    <!-- All Category budgets remain visible at every width. -->
    <section class="home-right min-w-0" aria-labelledby="budgets-title">
      <SectionHeader flush>
        {#snippet children()}<h2 id="budgets-title" class="m-0 text-sm font-semibold">Category budgets</h2>{/snippet}
        {#snippet right()}
          <button class="see-all control-link" onclick={() => onnavigate('summary')}>See summary</button>
        {/snippet}
      </SectionHeader>

      <div class="category-scroll-wrap border-t border-border">
      <dl class="category-scroll m-0">
        {#each CATEGORY_ORDER as key}
          {@const c = CATEGORIES[key]}
          {@const budget = store.master.budgets[key]}
          <div class="cat-chip flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 border-b border-border">
            <dt class="cat-chip-header flex min-w-0 items-center gap-2">
              <span class="cat-dot size-[6px] rounded-full shrink-0" style="background: {darkMode.current ? c.darkDot : c.dot};" aria-hidden="true"></span>
              <span class="cat-name text-sm wrap-anywhere">{c.label}</span>
            </dt>
            <dd class="cat-amount m-0 ml-auto min-w-0 max-w-full text-right">
              {#if Number.isFinite(budget)}
                <Money value={budget} size={14} />
              {:else}
                <span class="text-xs text-muted-foreground" aria-label="Budget unavailable">Unavailable</span>
              {/if}
            </dd>
          </div>
        {/each}
      </dl>
      </div>
    </section>
  </div>
{/if}
</div>
