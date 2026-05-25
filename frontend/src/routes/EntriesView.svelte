<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { store } from '../lib/store.svelte';
  import type { Entry, AddEntryPayload, UpdateEntryPatch } from '../lib/types';
  import { CATEGORIES, CATEGORY_ORDER } from '../lib/theme';
  import { countByCategory } from '../lib/aggregations';
  import { fmtDateShort } from '../lib/format';
  import { groupByWeek, groupEntriesByDate, weekStartOf, weekLabel } from '../lib/groupEntries';
  import Money from '../components/Money.svelte';
  import EntryDescBand from '../components/EntryDescBand.svelte';

  interface Props {
    onopenedit: (entry: Entry) => void;
    onadd: () => void;
    scrollEl: HTMLElement | null;
    scrollTop: number;
  }

  let { onopenedit, onadd, scrollEl, scrollTop }: Props = $props();

  onMount(async () => {
    await tick();
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
  });

  let filterDir  = $state<'all' | 'I' | 'O'>('all');
  let filterCat  = $state('');

  function currentWeekKey() {
    return weekStartOf(new Date().toISOString().slice(0, 10));
  }

  let selectedWeek = $state(currentWeekKey());

  const categoryNames = $derived(Object.keys(store.categories).sort());

  const filtered = $derived(
    store.entries
      .filter((e) => {
        if (filterDir !== 'all' && e.direction !== filterDir) return false;
        if (filterCat && e.mainCategory !== filterCat) return false;
        if (weekStartOf(e.date) !== selectedWeek) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
  );

  const weekGroups = $derived(groupByWeek(filtered));

  const selectableWeeks = $derived(() => {
    const cur = currentWeekKey();
    const fromEntries = groupByWeek(
      store.entries.filter(e => filterDir === 'all' || e.direction === filterDir)
    ).map(g => ({ key: g.key, label: g.label }));
    const hasCur = fromEntries.some(w => w.key === cur);
    const all = hasCur ? fromEntries : [...fromEntries, { key: cur, label: weekLabel(cur) }];
    return all.sort((a, b) => a.key.localeCompare(b.key));
  });

  const catCounts = $derived(
    countByCategory(store.entries, filterDir === 'all' ? undefined : filterDir)
  );

</script>

<div class="entries-view p-0" style="padding-bottom: 72px;">
  <!-- Page header -->
  <div class="page-header px-5 pt-5 pb-1">
    <div class="week-selector flex items-center gap-[3px] cursor-pointer">
      <select
        class="page-eyebrow font-display text-xs font-semibold tracking-[1.2px] uppercase text-muted-foreground appearance-none bg-transparent border-0 p-0 cursor-pointer outline-none"
        bind:value={selectedWeek}
      >
        {#each selectableWeeks() as week (week.key)}
          <option value={week.key}>{week.label}</option>
        {/each}
      </select>
      <svg class="week-caret text-muted-foreground pointer-events-none shrink-0 opacity-70" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </div>
    <div class="page-title font-display text-[28px] font-bold text-foreground mt-[2px] tracking-[-0.5px] flex items-baseline gap-[10px]">
      Entries
      <span class="entry-count font-mono text-[15px] text-muted-foreground font-normal tabular-nums">{filtered.length}</span>
    </div>
  </div>

  <div class="entries-body md:flex md:items-start">
  <!-- Filter bar: segmented control + category chips -->
  <div class="filter-bar relative flex flex-col gap-[6px] px-4 py-[10px] border-b border-border overflow-hidden md:flex-[0_0_200px] md:flex-col md:gap-1 md:py-3 md:px-[10px] md:border-b-0 md:border-r md:border-border md:static md:overflow-visible md:self-stretch">
    <div class="segmented flex shrink-0 gap-[2px] overflow-x-auto min-w-0" role="radiogroup" aria-label="Direction">
      {#each ([['all', 'All'], ['O', 'Outgoing'], ['I', 'Incoming']] as const) as [val, label]}
        <button
          class="py-1 px-2 rounded-[var(--radius-sm)] border-0 bg-transparent font-sans text-xs font-medium cursor-pointer whitespace-nowrap transition-[color,background] duration-150"
          class:text-accent={filterDir === val}
          class:text-muted-foreground={filterDir !== val}
          role="radio"
          aria-checked={filterDir === val}
          onclick={() => { filterDir = val; filterCat = ''; }}
        >{label}</button>
      {/each}
    </div>

    {#if categoryNames.length > 0}
      <div class="filter-sep hidden" aria-hidden="true"></div>
      <div class="cat-row flex gap-[6px] overflow-x-auto min-w-0 md:flex-col md:overflow-x-visible md:gap-[2px]">
        <button
          class="cat-chip-btn shrink-0 flex items-center gap-[5px] py-1 px-2 rounded-[var(--radius-sm)] border-0 bg-transparent font-sans text-xs font-medium cursor-pointer whitespace-nowrap transition-[background,color] duration-150 hover:bg-muted md:justify-start"
          class:text-accent={filterCat === ''}
          class:text-muted-foreground={filterCat !== ''}
          onclick={() => (filterCat = '')}
        >
          All
          <span class="chip-count font-mono text-[11px] tabular-nums opacity-[0.65]">{store.entries.filter(e => filterDir === 'all' || e.direction === filterDir).length}</span>
        </button>
        {#each CATEGORY_ORDER as key}
          {#if categoryNames.includes(key) && catCounts[key] > 0}
            {@const c = CATEGORIES[key]}
            <button
              class="cat-chip-btn shrink-0 flex items-center gap-[5px] py-1 px-2 rounded-[var(--radius-sm)] border-0 bg-transparent text-muted-foreground font-sans text-xs font-medium cursor-pointer whitespace-nowrap transition-[background,color] duration-150 hover:bg-muted md:justify-start"
              class:active={filterCat === key}
              style={filterCat === key ? `color: ${c.color};` : ''}
              onclick={() => (filterCat = filterCat === key ? '' : key)}
            >
              <span class="chip-dot size-[6px] rounded-full shrink-0" style="background: {c.color};"></span>
              {c.label}
              <span class="chip-count font-mono text-[11px] tabular-nums opacity-[0.65]">{catCounts[key]}</span>
            </button>
          {/if}
        {/each}
      </div>
    {/if}

    {#if scrollTop > 0}
      <div class="scroll-shadow absolute -bottom-5 left-0 right-0 h-5 bg-[linear-gradient(to_bottom,var(--border),transparent)] pointer-events-none z-[4] md:hidden" aria-hidden="true"></div>
    {/if}
  </div>

  <!-- Entry list -->
  <div class="entry-list mt-2 mx-4 flex flex-col gap-0 md:flex-1 md:ml-2 md:min-w-0">
    {#if filtered.length === 0}
      <button
        class="entry-card add-entry-card standalone font-display font-bold text-[13px] tracking-[0.5px] text-accent"
        onclick={onadd}
      >+ ADD ENTRY</button>
    {:else}
      {#each weekGroups as group, wi (group.key)}
        {@const dateGroups = groupEntriesByDate(group.entries)}
        <div class="week-group flex flex-col gap-[6px] mb-4">
          <div class="week-label font-display text-[11px] font-bold tracking-[0.8px] uppercase text-muted-foreground pt-1 pb-[2px] px-[2px]">{group.label}</div>
          {#each dateGroups as dateGroup, di (dateGroup[0].date)}
            {@const isLatestChunk = wi === weekGroups.length - 1 && di === dateGroups.length - 1}
            <div class="date-group rounded-[var(--radius-md)] shadow-[var(--shadow-card)] overflow-hidden">
              {#each dateGroup as entry, j (entry.id)}
                {@const dim = entry.amount === 0}
                {@const pending = store.pendingIds.has(entry.id)}
                {@const catStyle = CATEGORIES[entry.mainCategory] ?? { pastel: 'var(--muted)', color: 'var(--muted-foreground)' }}
                <div
                  class="entry-card relative flex items-center gap-[10px] py-3 pr-3 pl-[14px] bg-card rounded-none cursor-pointer"
                  class:opacity-[0.55]={dim}
                  class:pointer-events-none={pending}
                  class:cursor-default={pending}
                  class:border-t={j > 0}
                  class:border-border={j > 0}
                  onclick={() => !pending && onopenedit(entry)}
                  role="button"
                  tabindex="0"
                  onkeydown={(e) => !pending && e.key === 'Enter' && onopenedit(entry)}
                >
                  {#if pending}
                    <div class="entry-pending-overlay absolute inset-0 flex items-center justify-center bg-white/60 rounded-[var(--radius-md)] z-[1]">
                      <div class="entry-spinner size-[18px] rounded-full border-2 border-border border-t-accent animate-[spin_0.7s_linear_infinite]"></div>
                    </div>
                  {/if}

                  <span class="entry-date-lead font-mono text-[11px] font-normal tabular-nums text-muted-foreground whitespace-nowrap shrink-0">{fmtDateShort(entry.date)}</span>

                  <EntryDescBand description={entry.description} pastel={catStyle.pastel} color={catStyle.color} strikethrough={dim} />

                  <div class="entry-amount-wrap shrink-0 ml-auto">
                    <Money
                      value={entry.amount}
                      size={14}
                      weight={500}
                      negColor={false}
                      positive={entry.direction === 'I'}
                      {dim}
                    />
                  </div>
                </div>
              {/each}
            </div>
            {#if isLatestChunk}
              <button
                class="entry-card add-entry-card standalone font-display font-bold text-[13px] tracking-[0.5px] text-accent"
                onclick={onadd}
              >+ ADD ENTRY</button>
            {/if}
          {/each}
        </div>
      {/each}
    {/if}
  </div>
  </div>
</div>

<style>
  .entry-card:hover { background: color-mix(in srgb, var(--card) 96%, var(--foreground)); }

  .add-entry-card {
    width: 100%;
    border: 0;
    justify-content: center;
    background: color-mix(in srgb, var(--accent) 8%, var(--card));
  }
  .add-entry-card.standalone {
    border-radius: var(--radius-md);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent), 0 1px 2px rgba(13, 148, 136, 0.08), 0 4px 12px rgba(13, 148, 136, 0.16);
  }

  .segmented button:hover:not(.text-accent) { background: var(--muted); }
</style>
