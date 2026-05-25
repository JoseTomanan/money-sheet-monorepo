<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { store } from './lib/store.svelte';
  import type { Entry, EntryMutation } from './lib/types';
  import { applyMutation } from './lib/applyMutation';
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

  async function handleSave(m: EntryMutation) {
    applyMutation(store, m);
    if (m.type === 'add' && scrollArea) {
      await tick();
      scrollArea.scrollTop = scrollArea.scrollHeight;
    }
  }

  onMount(() => {
    store.init();
  });
</script>

<div class="app-shell relative min-h-dvh max-w-[var(--app-max-width)] mx-auto bg-background">
  <!-- Scrollable content area -->
  <div class="scroll-area h-dvh overflow-y-auto overflow-x-clip" bind:this={scrollArea} onscroll={handleScroll}>
    {#if store.loading}
      <div class="state-center flex flex-col items-center justify-center min-h-[60dvh] gap-3">
        <div class="loading-spinner size-7 rounded-full border-[2.5px] border-border border-t-accent animate-[spin_0.7s_linear_infinite]"></div>
        <p class="state-text font-sans text-sm text-muted-foreground m-0">Loading…</p>
      </div>
    {:else if store.error}
      <div class="error-card mx-4 my-6 p-5 rounded-[var(--radius-lg)] bg-[rgba(193,74,50,0.06)] border border-[rgba(193,74,50,0.2)]">
        <p class="error-title font-sans text-[15px] font-semibold text-destructive mb-1">Could not load data</p>
        <p class="error-body font-sans text-[13px] text-muted-foreground mb-[14px]">{store.error}</p>
        <button class="retry-btn py-2 px-[18px] rounded-[var(--radius-sm)] border-0 bg-destructive text-white font-sans text-[13px] font-semibold cursor-pointer" onclick={() => store.refreshAll()}>Retry</button>
      </div>
    {:else if tab === 'home'}
      <HomeScreen onnavigate={(t) => (tab = t)} />
    {:else if tab === 'entries'}
      <EntriesView onopenedit={openEdit} onadd={openAdd} scrollEl={scrollArea} {scrollTop} />
    {:else}
      <BudgetsView />
    {/if}
  </div>

  {#if !store.loading && !store.error}
    {#if scrollTop > 200}
      <button
        class="scroll-top-btn fixed bottom-20 w-11 h-11 rounded-full border border-border bg-background text-foreground flex items-center justify-center cursor-pointer z-40 shadow-[0_2px_8px_rgba(0,0,0,0.12)] transition-[background,transform] duration-150 hover:bg-muted hover:-translate-y-px right-[calc(max(0px,(100vw-var(--app-max-width))/2)+72px)]"
        onclick={scrollToTop}
        aria-label="Scroll to top"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="18 15 12 9 6 15"/>
        </svg>
      </button>
    {/if}
    <Fab onclick={openAdd} />
  {/if}

  {#if store.toastMsg}
    <div
      class="toast fixed bottom-[92px] left-1/2 -translate-x-1/2 max-w-[calc(var(--app-max-width)-32px)] w-[calc(100%-32px)] py-3 px-4 rounded-[var(--radius-md)] bg-foreground text-background font-sans text-[13px] font-medium z-[300] cursor-pointer animate-[toast-in_200ms_ease-out]"
      role="alert"
    >{store.toastMsg}</div>
  {/if}

  <TabBar active={tab} onchange={(t) => (tab = t)} />

  <EntrySheet
    open={sheetOpen}
    categories={store.categories}
    entry={sheetEntry}
    onclose={() => (sheetOpen = false)}
    onsave={handleSave}
    ondelete={(id) => { store.deleteEntry(id); sheetOpen = false; }}
  />
</div>

<style>
  @keyframes toast-in {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
</style>
