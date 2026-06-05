<script lang="ts">
  import { store } from '../lib/store.svelte';
  import type { Entry, AddEntryPayload, UpdateEntryPatch } from '../lib/types';
  import { CATEGORIES, CATEGORY_ORDER } from '../lib/theme';
  import { darkMode } from '../lib/darkMode.svelte';
  import { countByCategory } from '../lib/aggregations';
  import { groupByWeek, groupEntriesByDate, weekStartOf, weekLabel, compareEntriesForDisplay, splitRunPositions } from '../lib/groupEntries';
  import EntryRow from '../components/EntryRow.svelte';
  import WeekPicker from '../lib/components/ui/week-picker/WeekPicker.svelte';
  import * as Sheet from '$lib/components/ui/sheet';

  interface Props {
    onopenedit: (entry: Entry) => void;
    onadd: () => void;
    scrollEl: HTMLElement | null;
    scrollTop: number;
    selectMode?: boolean;
  }

  let { onopenedit, onadd, scrollEl, scrollTop, selectMode = $bindable(false) }: Props = $props();

  let hasScrolledToBottom = $state(false);
  $effect(() => {
    if (!store.loading && !hasScrolledToBottom) {
      hasScrolledToBottom = true;
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
    }
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
      .sort(compareEntriesForDisplay)
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

  $effect(() => {
    const weeks = selectableWeeks();
    if (!weeks.some(w => w.key === selectedWeek)) selectedWeek = currentWeekKey();
  });

  const catCounts = $derived(
    countByCategory(store.entries, filterDir === 'all' ? undefined : filterDir)
  );

  // ── Bulk select state ──────────────────────────────────────────────────────
  let selectedIds = $state(new Set<number>());
  let confirmOpen = $state(false);

  // Clear selection whenever select mode exits.
  $effect(() => { if (!selectMode) selectedIds = new Set(); });

  const selectableIds = $derived(
    filtered
      .filter(e => !store.pendingIds.has(e.id) && !store.deletePendingIds.has(e.id))
      .map(e => e.id)
  );

  function toggle(id: number): void {
    if (selectedIds.has(id)) {
      selectedIds = new Set([...selectedIds].filter(x => x !== id));
    } else {
      selectedIds = new Set([...selectedIds, id]);
    }
  }

  function selectAll(): void {
    selectedIds = new Set(selectableIds);
  }

  function clearAll(): void {
    selectedIds = new Set();
  }

  const allSelected = $derived(
    selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id))
  );

  async function confirmDelete(): Promise<void> {
    confirmOpen = false;
    await store.deleteEntries([...selectedIds]);
    selectMode = false;
  }
</script>

<div class="entries-view p-0">
{#if store.localIds.size > 0 && !selectMode}
  <div class="sync-bar fixed bottom-[72px] inset-x-0 z-10 flex justify-center pb-2 pointer-events-none">
    <button
      class="sync-now-btn pointer-events-auto flex items-center gap-[6px] py-[6px] px-4 rounded-[var(--radius-pill)] bg-card border border-border shadow-[var(--shadow-card)] font-sans text-[13px] font-medium text-accent transition-opacity duration-150"
      class:opacity-50={store.draining}
      disabled={store.draining}
      onclick={() => void store.drainQueue()}
    >
      <span class="text-[12px]">↑</span>
      Sync now
    </button>
  </div>
{/if}

<!-- Bulk-select action bar: sits above the TabBar when in select mode -->
{#if selectMode}
  <div class="select-bar fixed bottom-[72px] inset-x-0 z-10 flex items-center justify-between gap-3 px-4 py-[10px] bg-card border-t border-border shadow-[var(--shadow-tabbar)] max-w-[var(--app-max-width)] mx-auto">
    <span class="font-mono tabular-nums text-[14px] text-muted-foreground font-medium">
      {selectedIds.size} selected
    </span>
    <button
      class="delete-sel-btn flex items-center gap-[6px] py-[8px] px-[16px] rounded-[var(--radius-md)] border border-[var(--destructive-tint-border-strong)] bg-[var(--destructive-tint-strong)] text-destructive font-sans text-[13px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
      disabled={selectedIds.size === 0}
      onclick={() => (confirmOpen = true)}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        <path d="M10 11v6"/>
        <path d="M14 11v6"/>
        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
      </svg>
      Delete
    </button>
  </div>
{/if}

{#if store.loading}
  <!-- Skeleton -->
  <div class="page-header px-5 pt-5 pb-1">
    <div class="h-[10px] w-[100px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
    <div class="h-[28px] w-[160px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite] mt-[6px]"></div>
  </div>
  <div class="flex gap-2 px-4 py-3">
    {#each [0, 1, 2] as _}
      <div class="h-[30px] w-[72px] rounded-[var(--radius-pill)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
    {/each}
  </div>
  <div class="mx-4 mb-3">
    <div class="h-[32px] w-[160px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
  </div>
  <div class="mx-4 rounded-[var(--radius-lg)] bg-card shadow-[var(--shadow-card)] overflow-hidden">
    {#each [0, 1, 2, 3, 4, 5] as _}
      <div class="flex items-center gap-3 py-3 px-[14px] border-b border-border last:border-0">
        <div class="h-[10px] w-[40px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite] shrink-0"></div>
        <div class="h-[14px] flex-1 rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite]"></div>
        <div class="h-[14px] w-[56px] rounded-[var(--radius-sm)] bg-border animate-[shimmer_1s_ease-in-out_infinite] shrink-0"></div>
      </div>
    {/each}
  </div>
{:else}
  <div class="entries-body md:flex md:items-start">

  <!-- Left column: page header + filters. Sticky on desktop. -->
  <div class="left-col md:sticky md:top-0 md:h-dvh md:flex-[0_0_220px] md:shrink-0 md:flex md:flex-col md:overflow-y-auto md:border-r md:border-border md:pb-[72px]">

  <!-- Page header -->
  <div class="page-header px-5 pt-5 pb-1 md:px-4">
    <WeekPicker
      weeks={selectableWeeks()}
      currentWeekKey={currentWeekKey()}
      value={selectedWeek}
      onSelect={(k) => (selectedWeek = k)}
    />
    <div class="page-title font-display text-[28px] font-bold text-foreground mt-[2px] tracking-[-0.5px] flex items-baseline gap-[10px]">
      Entries
      <span class="entry-count font-mono text-[15px] text-muted-foreground font-normal tabular-nums">{filtered.length}</span>
      <!-- Select / Cancel toggle -->
      {#if selectMode}
        <button
          class="ml-auto font-sans text-[13px] font-medium text-muted-foreground bg-transparent border-0 cursor-pointer p-0 self-center"
          onclick={() => (selectMode = false)}
        >Cancel</button>
      {:else}
        <button
          class="ml-auto font-sans text-[13px] font-medium text-accent bg-transparent border-0 cursor-pointer p-0 self-center"
          onclick={() => (selectMode = true)}
          aria-label="Enter bulk-select mode"
        >Select</button>
      {/if}
    </div>

    <!-- Select-all / Clear controls shown only in select mode -->
    {#if selectMode}
      <div class="flex items-center gap-3 mt-[6px]">
        <button
          class="font-sans text-[12px] font-semibold bg-transparent border-0 cursor-pointer p-0"
          class:text-accent={!allSelected}
          class:text-muted-foreground={allSelected}
          onclick={() => allSelected ? clearAll() : selectAll()}
        >{allSelected ? 'Clear all' : 'Select all'}</button>
      </div>
    {/if}
  </div>

  <!-- Filter bar: sticky glass chrome on mobile, static in the desktop sidebar -->
  <div class="filter-bar sticky top-0 z-[5] flex flex-col gap-[6px] px-4 py-[10px] border-b border-border overflow-hidden filter-bar-glass md:border-b-0 md:flex-col md:gap-1 md:py-2 md:px-[10px] md:static md:overflow-visible md:flex-1 md:bg-transparent md:backdrop-blur-none">
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
              style={filterCat === key ? `color: ${darkMode.current ? c.darkColor : c.color};` : ''}
              onclick={() => (filterCat = filterCat === key ? '' : key)}
            >
              <span class="chip-dot size-[6px] rounded-full shrink-0" style="background: {c.dot};"></span>
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
  </div>

  <!-- Entry list -->
  <div class="entry-list mt-2 mx-4 pb-[72px] flex flex-col gap-0 md:flex-1 md:ml-2 md:mt-4 md:min-w-0">
    {#if filtered.length === 0}
      {#if !selectMode}
        <button
          class="entry-card add-entry-card standalone flex font-display font-bold text-[13px] tracking-[0.5px] text-accent"
          onclick={onadd}
        >+ ADD ENTRY</button>
      {/if}
    {:else}
      {#each weekGroups as group, wi (group.key)}
        {@const dateGroups = groupEntriesByDate(group.entries)}
        <div class="week-group flex flex-col gap-[6px] mb-4">
          <div class="week-label font-display text-[11px] font-bold tracking-[0.8px] uppercase text-muted-foreground pt-1 pb-[2px] px-[2px]">{group.label}</div>
          {#each dateGroups as dateGroup, di (dateGroup[0].date)}
            {@const isLatestChunk = wi === weekGroups.length - 1 && di === dateGroups.length - 1}
            {@const splitPos = splitRunPositions(dateGroup)}
            <div class="date-group rounded-[var(--radius-md)] shadow-[var(--shadow-card)] overflow-hidden">
              {#each dateGroup as entry, j (entry.id)}
                {@const dim = entry.amount === 0}
                {@const pending = store.pendingIds.has(entry.id)}
                {@const deletePending = store.deletePendingIds.has(entry.id)}
                {@const local = store.localIds.has(entry.id)}
                {@const selectable = selectMode && !pending && !deletePending}
                {@const checked = selectedIds.has(entry.id)}
                <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                <div
                  class="entry-card flex items-center gap-[10px] py-3 pr-3 pl-3 bg-card rounded-none cursor-pointer"
                  class:opacity-[0.55]={dim}
                  class:animate-[shimmer_1s_ease-in-out_infinite]={pending && !deletePending}
                  class:opacity-50={deletePending}
                  class:pointer-events-none={pending || deletePending}
                  class:cursor-default={pending || deletePending}
                  class:border-t={j > 0}
                  class:border-border={j > 0}
                  class:border-l-2={local}
                  class:border-local={local}
                  class:bg-[var(--destructive-tint-select)]={selectMode && checked}
                  onclick={() => {
                    if (selectMode) {
                      if (selectable) toggle(entry.id);
                    } else if (!pending && !deletePending) {
                      onopenedit(entry);
                    }
                  }}
                  role={selectMode ? 'checkbox' : 'button'}
                  aria-checked={selectMode ? checked : undefined}
                  tabindex="0"
                  onkeydown={(e) => {
                    if (selectMode) {
                      if ((e.key === 'Enter' || e.key === ' ') && selectable) toggle(entry.id);
                    } else if (!pending && !deletePending && e.key === 'Enter') {
                      onopenedit(entry);
                    }
                  }}
                >
                  <!-- Checkbox indicator in select mode -->
                  {#if selectMode}
                    <div
                      class="checkbox-box shrink-0 size-[18px] rounded-[5px] border-2 flex items-center justify-center transition-[background,border-color] duration-150"
                      class:bg-accent={checked}
                      class:border-accent={checked}
                      class:bg-transparent={!checked}
                      class:border-border={!checked}
                      aria-hidden="true"
                    >
                      {#if checked}
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                          <polyline points="2 6 5 9 10 3"/>
                        </svg>
                      {/if}
                    </div>
                  {/if}
                  <EntryRow {entry} splitPos={splitPos[j]} {local} />
                </div>
              {/each}
            </div>
            {#if isLatestChunk && !selectMode}
              <button
                class="entry-card add-entry-card standalone flex font-display font-bold text-[13px] tracking-[0.5px] text-accent"
                onclick={onadd}
              >+ ADD ENTRY</button>
            {/if}
          {/each}
        </div>
      {/each}
    {/if}
  </div>
  </div>
{/if}
</div>

<!-- Confirm-delete dialog -->
<Sheet.Root open={confirmOpen} onOpenChange={(v) => { if (!v) confirmOpen = false; }}>
  <div class="flex justify-center pt-[14px] pb-[10px]">
    <div class="w-9 h-1 rounded-[2px] bg-border"></div>
  </div>
  <Sheet.Header>
    <Sheet.Title>Delete {selectedIds.size} {selectedIds.size === 1 ? 'entry' : 'entries'}?</Sheet.Title>
  </Sheet.Header>
  <div class="px-5 pb-2 pt-1">
    <p class="font-sans text-[14px] text-muted-foreground">This action cannot be undone. The selected {selectedIds.size === 1 ? 'entry' : 'entries'} will be permanently removed.</p>
  </div>
  <div class="px-5 pb-6 flex flex-col gap-2 mt-2">
    <button
      class="w-full py-3 rounded-[var(--radius-md)] border-0 bg-destructive text-white font-sans text-[15px] font-semibold cursor-pointer"
      onclick={confirmDelete}
    >Delete {selectedIds.size === 1 ? 'entry' : `${selectedIds.size} entries`}</button>
    <button
      class="w-full py-3 rounded-[var(--radius-md)] border border-border bg-transparent text-foreground font-sans text-[15px] font-medium cursor-pointer"
      onclick={() => (confirmOpen = false)}
    >Cancel</button>
  </div>
</Sheet.Root>

<style>
  .add-entry-card {
    width: 100%;
    border: 0;
    justify-content: center;
    background: color-mix(in srgb, var(--accent) 8%, var(--card));
  }
  .add-entry-card.standalone {
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-card);
  }

  .segmented button:hover:not(.text-accent) { background: var(--muted); }

  /* glass filter bar — only active on mobile (md: overrides to transparent/static) */
  .filter-bar-glass {
    background: color-mix(in srgb, var(--background) 82%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }
</style>
