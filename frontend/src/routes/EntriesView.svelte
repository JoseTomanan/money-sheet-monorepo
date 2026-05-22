<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { store } from '../lib/store.svelte';
  import type { Entry, AddEntryPayload, UpdateEntryPatch } from '../lib/types';
  import { CATEGORIES, CATEGORY_ORDER } from '../lib/theme';
  import { fmtDateShort } from '../lib/format';
  import { groupByWeek } from '../lib/groupEntries';
  import Money from '../components/Money.svelte';

  interface Props {
    onopenedit: (entry: Entry) => void;
    scrollEl: HTMLElement | null;
    scrollTop: number;
  }

  let { onopenedit, scrollEl, scrollTop }: Props = $props();

  onMount(async () => {
    await tick();
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
  });

  let filterDir  = $state<'all' | 'I' | 'O'>('all');
  let filterCat  = $state('');

  const categoryNames = $derived(Object.keys(store.categories).sort());

  const filtered = $derived(
    store.entries
      .filter((e) => {
        if (filterDir !== 'all' && e.direction !== filterDir) return false;
        if (filterCat && e.mainCategory !== filterCat) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
  );

  const weekGroups = $derived(groupByWeek(filtered));

  const catCounts = $derived(
    Object.fromEntries(
      categoryNames.map((cat) => [
        cat,
        store.entries.filter(
          (e) =>
            e.mainCategory === cat &&
            (filterDir === 'all' || e.direction === filterDir)
        ).length,
      ])
    )
  );

</script>

<div class="entries-view" style="padding-bottom: 72px;">
  <!-- Page header -->
  <div class="page-header">
    <div class="month-label">All Time</div>
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
  <div class="entry-list" class:empty-state={filtered.length === 0}>
    {#if filtered.length === 0}
      <div class="empty">No entries found.</div>
    {:else}
      {#each weekGroups as group (group.key)}
        <div class="week-group">
          <div class="week-label">{group.label}</div>
          {#each group.entries as entry (entry.id)}
            {@const dim = entry.amount === 0}
            {@const catStyle = CATEGORIES[entry.mainCategory] ?? { pastel: 'var(--muted)', color: 'var(--muted-foreground)' }}
            <div
              class="entry-card"
              class:dim
              onclick={() => onopenedit(entry)}
              role="button"
              tabindex="0"
              onkeydown={(e) => e.key === 'Enter' && onopenedit(entry)}
            >
              <span class="entry-date-lead">{fmtDateShort(entry.date)}</span>

              <div
                class="entry-desc-band"
                style="background: {catStyle.pastel}80; color: {catStyle.color};"
              >
                <span class="entry-desc" class:strikethrough={dim}>{entry.description || '—'}</span>
              </div>

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
      {/each}
    {/if}
  </div>
</div>

<style>
  .entries-view { padding: 0; }

  .page-header {
    padding: 20px 20px 8px;
  }
  .month-label {
    font-family: var(--font-display);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    color: var(--muted-foreground);
  }
  .page-title {
    font-family: var(--font-display);
    font-size: 28px;
    font-weight: 700;
    color: var(--foreground);
    margin-top: 2px;
    letter-spacing: -0.5px;
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

  .week-label {
    font-family: var(--font-display);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    color: var(--muted-foreground);
    padding: 4px 2px 2px;
  }
  .entry-list.empty-state {
    flex: 1;
    min-height: calc(100dvh - 220px);
    justify-content: center;
    align-items: center;
  }
  .empty {
    padding: 32px;
    text-align: center;
    color: var(--muted-foreground);
    font-family: var(--font-sans);
    font-size: 14px;
  }

  .entry-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 12px 12px 14px;
    background: var(--card);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-card);
    cursor: pointer;
    transition: box-shadow 120ms;
  }
  .entry-card:hover {
    box-shadow: 0 2px 4px rgba(20,18,14,0.06), 0 8px 20px rgba(20,18,14,0.10);
  }
  .entry-card.dim { opacity: 0.55; }

  .entry-date-lead {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
    color: var(--muted-foreground);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .entry-desc-band {
    flex-shrink: 1;
    min-width: 0;
    max-width: 55%;
    padding: 2px 5px;
    border-radius: 0;
  }

  .entry-desc {
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
  }
  .strikethrough { text-decoration: line-through; }

  .entry-amount-wrap {
    flex-shrink: 0;
    margin-left: auto;
  }

</style>
