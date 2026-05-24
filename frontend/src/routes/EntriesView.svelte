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

<div class="entries-view" style="padding-bottom: 72px;">
  <!-- Page header -->
  <div class="page-header">
    <div class="week-selector">
      <select class="page-eyebrow" bind:value={selectedWeek}>
        {#each selectableWeeks() as week (week.key)}
          <option value={week.key}>{week.label}</option>
        {/each}
      </select>
      <svg class="week-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </div>
    <div class="page-title">
      Entries
      <span class="entry-count">{filtered.length}</span>
    </div>
  </div>

  <!-- Filter bar: segmented control + category chips -->
  <div class="filter-bar">
    <div class="segmented" role="radiogroup" aria-label="Direction">
      {#each ([['all', 'All'], ['O', 'Outgoing'], ['I', 'Incoming']] as const) as [val, label]}
        <button
          role="radio"
          aria-checked={filterDir === val}
          class:active={filterDir === val}
          onclick={() => { filterDir = val; filterCat = ''; }}
        >{label}</button>
      {/each}
    </div>

    {#if categoryNames.length > 0}
      <div class="filter-sep" aria-hidden="true"></div>
      <div class="cat-row">
        <button
          class="cat-chip-btn"
          class:active={filterCat === ''}
          onclick={() => (filterCat = '')}
        >
          All
          <span class="chip-count">{store.entries.filter(e => filterDir === 'all' || e.direction === filterDir).length}</span>
        </button>
        {#each CATEGORY_ORDER as key}
          {#if categoryNames.includes(key) && catCounts[key] > 0}
            {@const c = CATEGORIES[key]}
            <button
              class="cat-chip-btn"
              class:active={filterCat === key}
              style={filterCat === key ? `color: ${c.color};` : ''}
              onclick={() => (filterCat = filterCat === key ? '' : key)}
            >
              <span class="chip-dot" style="background: {c.color};"></span>
              {c.label}
              <span class="chip-count">{catCounts[key]}</span>
            </button>
          {/if}
        {/each}
      </div>
    {/if}

    {#if scrollTop > 0}
      <div class="scroll-shadow" aria-hidden="true"></div>
    {/if}
  </div>

  <!-- Entry list -->
  <div class="entry-list">
    {#if filtered.length === 0}
      <button class="entry-card add-entry-card standalone" onclick={onadd}>+ ADD ENTRY</button>
    {:else}
      {#each weekGroups as group, wi (group.key)}
        {@const dateGroups = groupEntriesByDate(group.entries)}
        <div class="week-group">
          <div class="week-label">{group.label}</div>
          {#each dateGroups as dateGroup, di (dateGroup[0].date)}
            {@const isLatestChunk = wi === weekGroups.length - 1 && di === dateGroups.length - 1}
            <div class="date-group">
              {#each dateGroup as entry, j (entry.id)}
                {@const dim = entry.amount === 0}
                {@const pending = store.pendingIds.has(entry.id)}
                {@const catStyle = CATEGORIES[entry.mainCategory] ?? { pastel: 'var(--muted)', color: 'var(--muted-foreground)' }}
                <div
                  class="entry-card"
                  class:dim
                  class:pending
                  class:not-first={j > 0}
                  onclick={() => !pending && onopenedit(entry)}
                  role="button"
                  tabindex="0"
                  onkeydown={(e) => !pending && e.key === 'Enter' && onopenedit(entry)}
                >
                  {#if pending}
                    <div class="entry-pending-overlay">
                      <div class="entry-spinner"></div>
                    </div>
                  {/if}

                  <span class="entry-date-lead">{fmtDateShort(entry.date)}</span>

                  <EntryDescBand description={entry.description} pastel={catStyle.pastel} color={catStyle.color} strikethrough={dim} />

                  <div class="entry-amount-wrap">
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
              <button class="entry-card add-entry-card standalone" onclick={onadd}>+ ADD ENTRY</button>
            {/if}
          {/each}
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .entries-view { padding: 0; }

  .page-title {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .entry-count {
    font-family: var(--font-mono);
    font-size: 15px;
    color: var(--muted-foreground);
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }

  .filter-bar {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 16px 10px;
    margin-bottom: 0;
    border-bottom: 1px solid var(--border);
    overflow: hidden;
  }
  @media (min-width: 768px) {
    .filter-bar {
      flex-direction: row;
      align-items: center;
      gap: 12px;
      position: sticky;
      top: 0;
      background: var(--background);
      z-index: 5;
    }
  }

  .segmented {
    display: flex;
    flex-shrink: 0;
    gap: 2px;
    overflow-x: auto;
    scrollbar-width: none;
    min-width: 0;
  }
  .segmented::-webkit-scrollbar { display: none; }
  .segmented button {
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    border: 0;
    background: transparent;
    color: var(--muted-foreground);
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: color 150ms, background 150ms;
  }
  .segmented button.active {
    color: var(--accent);
    background: transparent;
  }
  .segmented button:hover:not(.active) {
    background: var(--muted);
  }

  .filter-sep {
    display: none;
  }
  @media (min-width: 768px) {
    .filter-sep {
      display: block;
      width: 1px;
      height: 16px;
      background: var(--border);
      flex-shrink: 0;
    }
  }

  .cat-row {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
    min-width: 0;
  }
  @media (min-width: 768px) {
    .cat-row { flex: 1; }
  }

  .cat-chip-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    border: 0;
    background: transparent;
    color: var(--muted-foreground);
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 150ms, color 150ms;
    white-space: nowrap;
  }
  .cat-chip-btn.active:not([style]) {
    color: var(--accent);
  }
  .cat-chip-btn:hover {
    background: var(--muted);
  }
  .chip-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .chip-count {
    font-family: var(--font-mono);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    opacity: 0.65;
  }

  .scroll-shadow {
    position: absolute;
    bottom: -20px;
    left: 0;
    right: 0;
    height: 20px;
    background: linear-gradient(to bottom, var(--border), transparent);
    pointer-events: none;
    z-index: 4;
  }

  .entry-list {
    margin: 8px 16px 0;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .week-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 16px;
  }

  .date-group {
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-card);
    overflow: hidden;
  }

  .week-label {
    font-family: var(--font-display);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: var(--muted-foreground);
    padding: 4px 2px 2px;
  }

  .entry-card {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 12px 12px 14px;
    background: var(--card);
    border-radius: 0;
    cursor: pointer;
  }
  .entry-card.not-first {
    border-top: 1px solid var(--border);
  }
  .entry-card:hover { background: color-mix(in srgb, var(--card) 96%, var(--foreground)); }
  .entry-card.dim { opacity: 0.55; }
  .entry-card.pending { pointer-events: none; cursor: default; }

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

  .entry-pending-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.6);
    border-radius: var(--radius-md);
    z-index: 1;
  }
  .entry-spinner {
    width: 18px;
    height: 18px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }


</style>
