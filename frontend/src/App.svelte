<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { store } from './lib/store.svelte';
  import type { Entry, AddEntryPayload, UpdateEntryPatch } from './lib/types';
  import TabBar, { type TabId } from './components/TabBar.svelte';
  import Fab from './components/Fab.svelte';
  import EntrySheet from './components/EntrySheet.svelte';
  import HomeScreen from './routes/HomeScreen.svelte';
  import EntriesView from './routes/EntriesView.svelte';
  import BudgetsView from './routes/BudgetsView.svelte';

  let tab = $state<TabId>('home');
  let scrollArea = $state<HTMLElement | null>(null);
  let scrollTop = $state(0);

  function handleScroll() {
    if (scrollArea) scrollTop = scrollArea.scrollTop;
  }

  function scrollToTop() {
    if (scrollArea) scrollArea.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Entry sheet state
  let sheetOpen = $state(false);
  let sheetEntry = $state<Entry | null>(null);

  function openAdd() {
    sheetEntry = null;
    sheetOpen = true;
  }

  function openEdit(entry: Entry) {
    sheetEntry = entry;
    sheetOpen = true;
  }

  async function handleSave(
    payload: AddEntryPayload | { id: number; patch: UpdateEntryPatch }
  ) {
    const isAdd = !('id' in payload);
    if ('id' in payload) {
      await store.updateEntry(payload.id, payload.patch);
    } else {
      await store.addEntry(payload);
    }
    if (isAdd && scrollArea) {
      await tick();
      scrollArea.scrollTop = scrollArea.scrollHeight;
    }
  }

  onMount(() => {
    store.refreshAll();
  });
</script>

<div class="app-shell">
  <!-- Scrollable content area -->
  <div class="scroll-area" bind:this={scrollArea} onscroll={handleScroll}>
    {#if store.loading}
      <div class="state-center">
        <div class="loading-spinner"></div>
        <p class="state-text">Loading…</p>
      </div>
    {:else if store.error}
      <div class="error-card">
        <p class="error-title">Could not load data</p>
        <p class="error-body">{store.error}</p>
        <button class="retry-btn" onclick={() => store.refreshAll()}>Retry</button>
      </div>
    {:else if tab === 'home'}
      <HomeScreen onnavigate={(t) => (tab = t)} />
    {:else if tab === 'entries'}
      <EntriesView onopenedit={openEdit} scrollEl={scrollArea} {scrollTop} />
    {:else}
      <BudgetsView />
    {/if}
  </div>

  <!-- FAB + scroll-to-top: only on Entries tab -->
  {#if tab === 'entries' && !store.loading && !store.error}
    {#if scrollTop > 200}
      <button class="scroll-top-btn" onclick={scrollToTop} aria-label="Scroll to top">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="18 15 12 9 6 15"/>
        </svg>
      </button>
    {/if}
    <Fab onclick={openAdd} />
  {/if}

  <TabBar active={tab} onchange={(t) => (tab = t)} />

  <EntrySheet
    open={sheetOpen}
    categories={store.categories}
    entry={sheetEntry}
    onclose={() => (sheetOpen = false)}
    onsave={handleSave}
  />
</div>

<style>
  .app-shell {
    position: relative;
    min-height: 100dvh;
    max-width: var(--app-max-width);
    margin: 0 auto;
    background: var(--background);
  }

  .scroll-area {
    height: 100dvh;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .scroll-top-btn {
    position: fixed;
    bottom: 146px;
    right: calc(max(0px, (100vw - var(--app-max-width)) / 2) + 28px);
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--background);
    color: var(--foreground);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.12);
    z-index: 40;
    transition: background 150ms, transform 150ms;
  }
  .scroll-top-btn:hover { background: var(--muted); transform: translateY(-1px); }

  .state-center {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60dvh;
    gap: 12px;
  }
  .loading-spinner {
    width: 28px;
    height: 28px;
    border: 2.5px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .state-text {
    font-family: var(--font-sans);
    font-size: 14px;
    color: var(--muted-foreground);
    margin: 0;
  }

  .error-card {
    margin: 24px 16px;
    padding: 20px;
    border-radius: var(--radius-lg);
    background: rgba(193, 74, 50, 0.06);
    border: 1px solid rgba(193, 74, 50, 0.2);
  }
  .error-title {
    font-family: var(--font-sans);
    font-size: 15px;
    font-weight: 600;
    color: var(--destructive);
    margin: 0 0 4px;
  }
  .error-body {
    font-family: var(--font-sans);
    font-size: 13px;
    color: var(--muted-foreground);
    margin: 0 0 14px;
  }
  .retry-btn {
    padding: 8px 18px;
    border-radius: var(--radius-sm);
    border: 0;
    background: var(--destructive);
    color: #fff;
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
</style>
