<script lang="ts">
  import { store } from '../lib/store.svelte';
  import type { Entry, AddEntryPayload, UpdateEntryPatch } from '../lib/types';
  import { CATEGORIES, CATEGORY_ORDER } from '../lib/theme';
  import { fmtDate, dayOfWeek } from '../lib/format';
  import Money from '../components/Money.svelte';
  import TagPill from '../components/TagPill.svelte';

  interface Props {
    onopenedit: (entry: Entry) => void;
  }

  let { onopenedit }: Props = $props();

  let filterDir  = $state<'all' | 'I' | 'O'>('all');
  let filterCat  = $state('');
  let pendingDelete = $state<number | null>(null);
  let deleting = $state<number | null>(null);

  const categoryNames = $derived(Object.keys(store.categories).sort());

  const filtered = $derived(
    store.entries
      .filter((e) => {
        if (filterDir !== 'all' && e.direction !== filterDir) return false;
        if (filterCat && e.mainCategory !== filterCat) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
  );

  // Per-category count for filter chips
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

  async function confirmDelete(id: number) {
    deleting = id;
    await store.deleteEntry(id);
    pendingDelete = null;
    deleting = null;
  }
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

  <!-- Direction filter chips -->
  <div class="chip-row">
    {#each ([['all', 'All'], ['O', 'Outgoing'], ['I', 'Incoming']] as const) as [val, label]}
      <button
        class="dir-chip"
        class:active={filterDir === val}
        onclick={() => { filterDir = val; filterCat = ''; }}
      >{label}</button>
    {/each}
  </div>

  <!-- Category filter chips -->
  {#if categoryNames.length > 0}
    <div class="chip-row cat-chips">
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
            style="
              --chip-color: {c.color};
              --chip-soft: {c.soft};
              {filterCat === key ? `background: ${c.soft}; color: ${c.color}; border-color: ${c.color}33;` : ''}
            "
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

  <!-- Entry list -->
  <div class="entry-list">
    {#if filtered.length === 0}
      <div class="empty">No entries found.</div>
    {:else}
      {#each filtered as entry (entry.id)}
        {@const c = CATEGORIES[entry.mainCategory]}
        {@const dim = entry.amount === 0}
        <div
          class="entry-card"
          class:dim
          onclick={() => { pendingDelete = null; onopenedit(entry); }}
          role="button"
          tabindex="0"
          onkeydown={(e) => e.key === 'Enter' && onopenedit(entry)}
        >
          <!-- colored left bar -->
          <div
            class="entry-bar"
            style="background: {entry.direction === 'I' ? 'var(--positive)' : 'var(--destructive)'};"
          ></div>

          <!-- main content -->
          <div class="entry-body">
            <div class="entry-top">
              <span class="entry-desc" class:strikethrough={dim}>{entry.description || '—'}</span>
              <Money
                value={entry.direction === 'I' ? entry.amount : -entry.amount}
                size={15}
                weight={500}
                negColor={false}
                dim={dim}
              />
            </div>
            <div class="entry-bottom">
              <TagPill tag={entry.tag} direction={entry.direction} mainCategory={entry.mainCategory} small />
              <span class="entry-date" style="font-family: var(--font-mono); font-variant-numeric: tabular-nums;">
                {dayOfWeek(entry.date)} {fmtDate(entry.date)}
              </span>
            </div>
          </div>

          <!-- delete controls (stop propagation so clicking these doesn't also open edit) -->
          <div class="entry-actions" onclick={(e) => e.stopPropagation()} role="none">
            {#if pendingDelete === entry.id}
              <div class="delete-confirm">
                <button
                  class="confirm-btn"
                  disabled={deleting === entry.id}
                  onclick={() => confirmDelete(entry.id)}
                >
                  {deleting === entry.id ? '…' : 'Delete'}
                </button>
                <button class="cancel-btn" onclick={() => (pendingDelete = null)}>✕</button>
              </div>
            {:else}
              <button
                class="delete-trigger"
                aria-label="Delete entry"
                onclick={() => (pendingDelete = entry.id)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                </svg>
              </button>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .entries-view { padding: 0; }

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

  .chip-row {
    display: flex;
    gap: 6px;
    padding: 10px 16px 0;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .cat-chips { padding-top: 8px; }

  .dir-chip {
    flex-shrink: 0;
    padding: 7px 14px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--muted-foreground);
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 150ms, color 150ms;
    white-space: nowrap;
  }
  .dir-chip.active {
    background: var(--foreground);
    color: var(--background);
    border-color: var(--foreground);
  }

  .cat-chip-btn {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 12px;
    border-radius: var(--radius-pill);
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--muted-foreground);
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: background 150ms, color 150ms, border-color 150ms;
    white-space: nowrap;
  }
  .cat-chip-btn.active:not([style*='background']) {
    background: var(--foreground);
    color: var(--background);
    border-color: var(--foreground);
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

  .entry-list {
    margin: 12px 16px 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
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
    align-items: stretch;
    gap: 12px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
    cursor: pointer;
    transition: background 120ms;
  }
  .entry-card:hover { background: var(--muted); }
  .entry-card.dim { opacity: 0.55; }

  .entry-bar {
    width: 4px;
    flex-shrink: 0;
    align-self: stretch;
  }

  .entry-body {
    flex: 1;
    min-width: 0;
    padding: 12px 0 12px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .entry-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .entry-desc {
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 500;
    color: var(--foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }
  .strikethrough { text-decoration: line-through; }
  .entry-bottom {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .entry-date {
    font-size: 10px;
    color: var(--muted-foreground);
  }

  .entry-actions {
    display: flex;
    align-items: center;
    padding: 0 10px 0 0;
    flex-shrink: 0;
  }
  .delete-trigger {
    background: none;
    border: 0;
    cursor: pointer;
    color: var(--muted-foreground);
    padding: 6px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 150ms;
  }
  .delete-trigger:hover { color: var(--destructive); }

  .delete-confirm {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .confirm-btn {
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    border: 0;
    background: rgba(193, 74, 50, 0.12);
    color: var(--destructive);
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .cancel-btn {
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    border: 0;
    background: var(--muted);
    color: var(--muted-foreground);
    font-family: var(--font-sans);
    font-size: 12px;
    cursor: pointer;
  }
</style>
