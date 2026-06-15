<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { store } from './lib/store.svelte';
  import { connection } from './lib/connection.svelte';
  import type { Entry, EntryMutation } from './lib/types';
  import TabBar, { type TabId } from './components/TabBar.svelte';
  import Fab from './components/Fab.svelte';
  import EntrySheet from './components/EntrySheet.svelte';
  import Settings from './components/Settings.svelte';
  import SettingsGate from './components/SettingsGate.svelte';
  import { Toast } from '$lib/components/ui/toast';
  import * as Sheet from '$lib/components/ui/sheet';
  import HomeScreen from './routes/HomeScreen.svelte';
  import EntriesView from './routes/EntriesView.svelte';
  import SummaryView from './routes/SummaryView.svelte';

  let tab = $state<TabId>('home');
  let scrollArea = $state<HTMLElement | null>(null);
  let scrollTop = $state(0);
  let entriesSelectMode = $state(false);

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
    if (m.type === 'add') store.addEntry(m.payload);
    else store.updateEntry(m.id, m.patch);
    if (m.type === 'add' && scrollArea) {
      await tick();
      scrollArea.scrollTop = scrollArea.scrollHeight;
    }
  }

  // Settings overlay state
  let settingsOpen = $state(false);

  onMount(() => {
    if (connection.current) store.init();
  });
</script>

{#if connection.current == null}
  <SettingsGate onsaved={() => store.refreshAll()} />
{:else}
  <div class="app-shell relative min-h-dvh max-w-[var(--app-max-width)] mx-auto bg-transparent">
    {#if store.syncing}
      <span
        class="fixed top-[14px] z-50 size-2 rounded-full bg-accent animate-pulse right-[calc(max(0px,(100vw-var(--app-max-width))/2)+36px)]"
        aria-label="Syncing data"
      ></span>
    {/if}

    <!-- Gear button: fixed top-right -->
    <button
      class="gear-btn fixed top-3 z-50 p-2 rounded-full bg-transparent border-0 cursor-pointer text-muted-foreground hover:text-foreground transition-colors duration-150 right-[calc(max(0px,(100vw-var(--app-max-width))/2)+8px)]"
      onclick={() => (settingsOpen = true)}
      aria-label="Open settings"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    </button>

    <!-- Scrollable content area -->
    <div class="scroll-area h-dvh overflow-y-auto overflow-x-clip" bind:this={scrollArea} onscroll={handleScroll}>
      {#if store.error}
        <div class="error-card mx-4 my-6 p-5 rounded-[var(--radius-lg)] bg-[var(--destructive-tint-bg)] border border-[var(--destructive-tint-border)]">
          <p class="error-title font-sans text-[15px] font-semibold text-destructive mb-1">Could not load data</p>
          <p class="error-body font-sans text-[13px] text-muted-foreground mb-[14px]">{store.error}</p>
          <div class="flex gap-2">
            <button class="retry-btn py-2 px-[18px] rounded-[var(--radius-sm)] border-0 bg-destructive text-white font-sans text-[13px] font-semibold cursor-pointer" onclick={() => store.refreshAll()}>Retry</button>
            {#if store.errorIsConnection}
              <button class="settings-btn py-2 px-[18px] rounded-[var(--radius-sm)] border border-border bg-muted text-foreground font-sans text-[13px] font-semibold cursor-pointer" onclick={() => (settingsOpen = true)}>Check Settings</button>
            {/if}
          </div>
        </div>
      {:else if tab === 'home'}
        <HomeScreen onnavigate={(t) => (tab = t)} />
      {:else if tab === 'entries'}
        <EntriesView onopenedit={openEdit} onadd={openAdd} scrollEl={scrollArea} {scrollTop} bind:selectMode={entriesSelectMode} />
      {:else}
        <SummaryView onbulkdelete={() => { entriesSelectMode = true; tab = 'entries'; }} />
      {/if}
    </div>

    {#if !store.loading && !store.error}
      {#if scrollTop > 200}
        <button
          class="scroll-top-btn fixed bottom-20 w-11 h-11 rounded-full border border-border bg-background text-foreground flex items-center justify-center cursor-pointer z-40 shadow-card transition-[background,transform] duration-150 hover:bg-muted hover:-translate-y-px right-[calc(max(0px,(100vw-var(--app-max-width))/2)+72px)]"
          onclick={scrollToTop}
          aria-label="Scroll to top"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="18 15 12 9 6 15"/>
          </svg>
        </button>
      {/if}
      {#if !(tab === 'entries' && entriesSelectMode)}
        <Fab onclick={openAdd} />
      {/if}
    {/if}

    {#if store.toastMsg}
      <Toast
        class="toast fixed bottom-[92px] left-1/2 -translate-x-1/2 max-w-[calc(var(--app-max-width)-32px)] w-[calc(100%-32px)]"
        message={store.toastMsg}
        variant={store.toastVariant}
        isConnection={store.toastIsConnection}
        action={store.toastAction}
        onSettings={() => (settingsOpen = true)}
        onDismiss={store.dismissToast}
      />
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

    <!-- Settings overlay (shadcn Sheet, side=bottom) -->
    <Sheet.Root open={settingsOpen} onOpenChange={(v) => (settingsOpen = v)}>
      <div class="flex justify-center pt-[14px] pb-[10px]">
        <div class="w-9 h-1 rounded-[2px] bg-border"></div>
      </div>
      <Sheet.Header>
        <Sheet.Title>Settings</Sheet.Title>
        <button
          class="bg-transparent border-0 cursor-pointer font-sans text-[15px] p-0 text-muted-foreground"
          onclick={() => (settingsOpen = false)}
        >Done</button>
      </Sheet.Header>
      <Settings onsaved={() => { settingsOpen = false; store.refreshAll(); }} />
    </Sheet.Root>
  </div>
{/if}

<style>
  @keyframes toast-in {
    from { opacity: 0; transform: translateX(-50%) translateY(8px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
</style>
