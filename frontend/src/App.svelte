<script lang="ts">
  import { onMount, tick, setContext } from 'svelte';
  import { store } from './lib/store.svelte';
  import { toast } from './lib/toast.svelte';
  import { connection, mockMode, exitMockMode } from './lib/connection.svelte';
  import { createRouter, routeTab, type Route } from './lib/router.svelte';
  import { currentWeekKey } from './lib/entriesFilter.svelte';
  import { installPageShortcuts, openOverlays, KEYBOARD_CONTEXT, type KeyboardContext } from './lib/keyboard';
  import { appCommands, COMMAND_MENU, type CommandId } from './lib/commandMenu';
  import CommandMenu from './components/ui/CommandMenu.svelte';
  import { keyboardPreferences } from './lib/keyboardPreferences.svelte';
  import type { Entry, EntryMutation } from './lib/types';
  import MockBanner from './components/ui/MockBanner.svelte';
  import TabBar, { type TabId } from './components/ui/TabBar.svelte';
  import Fab from './components/ui/Fab.svelte';
  import EntrySheet from './components/entry/EntrySheet.svelte';
  import Settings from './components/settings/Settings.svelte';
  import SettingsGate from './components/settings/SettingsGate.svelte';
  import { Toast } from '$lib/components/ui/toast';
  import * as Sheet from '$lib/components/ui/sheet';
  import HomeScreen from './routes/HomeScreen.svelte';
  import EntriesView from './routes/EntriesView.svelte';
  import SummaryView from './routes/SummaryView.svelte';
  import DeeperStatsView from './routes/DeeperStatsView.svelte';

  let scrollArea = $state<HTMLElement | null>(null);
  let scrollTop = $state(0);
  let entriesSelectMode = $state(false);
  const router = createRouter();
  let entriesView = $state<EntriesView | null>(null);
  let commandOpen = $state(false);
  let commandSession = $state<{
    opener: HTMLElement | null;
    connection: typeof connection.current;
    mock: boolean;
    route: string;
  } | null>(null);
  setContext(COMMAND_MENU, openCommandMenu);
  setContext<() => KeyboardContext>(KEYBOARD_CONTEXT, () => entriesSelectMode ? 'bulk' : router.current.kind);
  const routeScrollPositions = new Map<string, number>();

  function handleScroll() {
    if (!scrollArea) return;
    scrollTop = scrollArea.scrollTop;
    routeScrollPositions.set(router.key, scrollTop);
  }

  function scrollToTop() {
    if (scrollArea) scrollArea.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeRouteOverlays() {
    commandOpen = false;
    sheetOpen = false;
    settingsOpen = false;
    entriesSelectMode = false;
  }

  function navigate(next: Route) {
    if (!router.navigate(next)) return;
    closeRouteOverlays();
    if (scrollArea) {
      scrollArea.scrollTop = 0;
      scrollTop = 0;
    }
    routeScrollPositions.set(router.key, 0);
  }

  function navigateTab(tab: TabId) {
    if (tab === 'entries') {
      if (router.current.kind !== 'entries') navigate({ kind: 'entries', week: currentWeekKey() });
      return;
    }
    navigate({ kind: tab });
  }

  function syncRoute() {
    if (scrollArea) routeScrollPositions.set(router.key, scrollArea.scrollTop);
    if (!router.sync()) return;
    closeRouteOverlays();
    if (scrollArea) {
      scrollArea.scrollTop = routeScrollPositions.get(router.key) ?? 0;
      scrollTop = scrollArea.scrollTop;
    }
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

  function handleSave(m: EntryMutation) {
    if (m.type === 'edit') return store.submitUpdateEntry(m.id, m.patch);
    const routeKey = router.key;
    const destination = connection.current;
    const mock = mockMode.current;
    const submission = store.submitAddEntry(m.payload);
    if (submission.accepted) void tick().then(() => {
      if (router.key === routeKey && connection.current === destination && mockMode.current === mock && scrollArea) {
        scrollArea.scrollTop = scrollArea.scrollHeight;
      }
    });
    return submission;
  }

  // Settings overlay state
  let settingsOpen = $state(false);

  const commands = $derived(appCommands({
    loading: store.loading, error: store.error, selecting: entriesSelectMode,
    entries: router.current.kind === 'entries',
    redistributionAvailable: entriesView?.canRedistribute() ?? false,
    syncAction: store.syncStatus.action,
  }));

  function openCommandMenu() {
    if (commandOpen || !(connection.current || mockMode.current) || sheetOpen || settingsOpen || openOverlays().length) return;
    commandSession = {
      opener: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      connection: connection.current, mock: mockMode.current, route: router.key,
    };
    commandOpen = true;
  }

  function runCommand(id: CommandId): boolean {
    const session = commandSession;
    // Recheck the live context and availability after dismissal, including credential
    // rotation. No captured callback may dispatch to an obsolete Connection.
    if (!session || session.connection !== connection.current || session.mock !== mockMode.current || session.route !== router.key ||
      !(connection.current || mockMode.current) || sheetOpen || settingsOpen || openOverlays().length ||
      commands.find(command => command.id === id)?.reason !== '') return false;
    if (id === 'add') openAdd();
    else if (id === 'redistribute') entriesView?.openRedistribution();
    else if (id === 'settings') settingsOpen = true;
    else {
      if (id === 'sync') void store.retrySync();
      else navigateTab(id);
      void tick().then(() => document.querySelector<HTMLElement>('[data-app-navigation][aria-current="page"]')?.focus());
    }
    return true;
  }

  $effect(() => {
    if (commandOpen && commandSession && (commandSession.connection !== connection.current || commandSession.mock !== mockMode.current || commandSession.route !== router.key)) commandOpen = false;
  });

  onMount(() => {
    const removeShortcuts = installPageShortcuts({
      context: () => `${router.key}:${entriesSelectMode}:${sheetOpen}:${settingsOpen}`,
      available: () => !!(mockMode.current || connection.current) && !sheetOpen && !settingsOpen,
      canAdd: () => !store.loading && !store.error && !entriesSelectMode,
      charactersEnabled: () => keyboardPreferences.enabled,
      add: openAdd,
      navigate: navigateTab,
      commandMenu: openCommandMenu,
    });
    const syncToastVisibility = () => document.hidden ? toast.pause('hidden') : toast.resume('hidden');
    syncToastVisibility();
    document.addEventListener('visibilitychange', syncToastVisibility);
    if (mockMode.current || connection.current) store.init();
    return () => {
      removeShortcuts();
      document.removeEventListener('visibilitychange', syncToastVisibility);
      toast.resume('hidden');
      store.dispose();
    };
  });
</script>

<svelte:window onhashchange={syncRoute} onpopstate={syncRoute} />

{#if connection.current == null && !mockMode.current}
  <SettingsGate onsaved={() => {}} />
{:else}
  {#if mockMode.current}
    <MockBanner onExit={exitMockMode} />
  {/if}
  <div class="app-shell relative min-h-dvh max-w-[var(--app-max-width)] mx-auto bg-transparent {mockMode.current ? 'pt-11 lg:pt-8' : ''}">
    <!-- Scrollable content area -->
    <div class="scroll-area h-dvh overflow-y-auto overflow-x-clip pb-[calc(60px+env(safe-area-inset-bottom,0px))]" bind:this={scrollArea} onscroll={handleScroll}>
      {#if store.legacyWork && !mockMode.current}
        <div class="mx-4 my-4 p-4 rounded-lg border border-border bg-background">
          <p class="text-sm text-foreground">Older pending saves have no known destination. They are retained on this device and will not sync automatically.</p>
          <button class="mt-3 text-sm font-semibold text-accent cursor-pointer" onclick={() => (settingsOpen = true)}>Recover pending saves in Settings</button>
        </div>
      {/if}
      {#if store.error}
        <div class="error-card mx-4 my-6 p-5 rounded-[var(--radius-lg)] bg-[var(--destructive-tint-bg)] border border-[var(--destructive-tint-border)]">
          <p class="error-title font-sans text-[15px] font-semibold text-destructive mb-1">Could not load data</p>
          <p class="error-body font-sans text-[13px] text-muted-foreground mb-[14px]">{store.error}</p>
          <div class="flex gap-2">
            <button class="retry-btn py-2 px-[18px] rounded-[var(--radius-sm)] border-0 bg-destructive-fill text-white font-sans text-[13px] font-semibold cursor-pointer" onclick={() => store.refreshAll()}>Retry</button>
            {#if store.errorIsConnection}
              <button class="settings-btn py-2 px-[18px] rounded-[var(--radius-sm)] border border-border bg-muted text-foreground font-sans text-[13px] font-semibold cursor-pointer" onclick={() => (settingsOpen = true)}>Check Settings</button>
            {/if}
          </div>
        </div>
      {/if}
        {#key router.key}
          {#if router.current.kind === 'home'}
            <HomeScreen onnavigate={navigateTab} onsettings={() => (settingsOpen = true)} />
          {:else if router.current.kind === 'entries'}
            <EntriesView
              bind:this={entriesView}
              onopenedit={openEdit}
              onadd={openAdd}
              selectedWeek={router.current.week}
              onweekchange={(week) => navigate({ kind: 'entries', week })}
              scrollEl={scrollArea}
              {scrollTop}
              bind:selectMode={entriesSelectMode}
              onsettings={() => (settingsOpen = true)}
            />
          {:else if router.current.kind === 'statistics'}
            <DeeperStatsView onback={() => navigate({ kind: 'summary' })} onsettings={() => (settingsOpen = true)} />
          {:else}
            <SummaryView ondeeper={() => navigate({ kind: 'statistics' })} onsettings={() => (settingsOpen = true)} />
          {/if}
        {/key}
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
      {#if !(router.current.kind === 'entries' && entriesSelectMode)}
        <Fab onclick={openAdd} />
      {/if}
    {/if}

    <Toast
      class="toast fixed bottom-[calc(92px+env(safe-area-inset-bottom,0px))] inset-x-0 mx-auto max-w-[420px] w-[calc(100%-32px)]"
      message={toast.msg}
      presentation={toast.presentation}
      variant={toast.variant}
      isConnection={toast.isConnection}
      isError={toast.isError}
      action={toast.action}
      onSettings={() => (settingsOpen = true)}
      onDismiss={toast.dismiss}
      onPause={toast.pause}
      onResume={toast.resume}
    />

    <TabBar active={routeTab(router.current)} onchange={navigateTab} />

    <CommandMenu open={commandOpen} {commands} opener={commandSession?.opener ?? null} onclose={() => (commandOpen = false)} onselect={runCommand} />

    <EntrySheet
      open={sheetOpen}
      categories={store.categories}
      entry={sheetEntry}
      onclose={() => (sheetOpen = false)}
      onsave={handleSave}
      ondelete={store.submitDeleteEntry}
    />

    <!-- Settings overlay (shadcn Sheet, side=bottom) -->
    <Sheet.Root open={settingsOpen} onOpenChange={(v) => (settingsOpen = v)}>
      <div class="flex justify-center pt-[14px] pb-[10px]">
        <div class="w-9 h-1 rounded-[2px] bg-border"></div>
      </div>
      <Sheet.Header>
        <Sheet.Title>Settings</Sheet.Title>
        <button
          class="min-h-11 min-w-11 flex items-center justify-center bg-transparent border-0 cursor-pointer font-sans text-[15px] p-0 text-muted-foreground lg:min-h-8 lg:min-w-0"
          onclick={() => (settingsOpen = false)}
        >Done</button>
      </Sheet.Header>
      <Settings onsaved={() => { settingsOpen = false; }} legacyWork={store.legacyWork && !mockMode.current} onrecover={() => void store.recoverLegacyWork()} />
    </Sheet.Root>
  </div>
{/if}
