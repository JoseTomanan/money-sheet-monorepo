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
  import PageHeader from './components/ui/PageHeader.svelte';
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
  const routeTitles = { home: 'Home', entries: 'Entries', summary: 'Summary', statistics: 'Deeper stats' };
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

  function handleScroll(event: Event, owner: string) {
    if (!scrollArea || event.currentTarget !== scrollArea || owner !== router.key) return;
    scrollTop = scrollArea.scrollTop;
    routeScrollPositions.set(router.key, scrollTop);
  }

  function scrollToTop() {
    if (scrollArea) scrollArea.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }

  function closeRouteOverlays() {
    commandOpen = false;
    sheetOpen = false;
    settingsOpen = false;
    entriesSelectMode = false;
  }

  function navigate(next: Route) {
    if (scrollArea) routeScrollPositions.set(router.key, scrollArea.scrollTop);
    if (!router.navigate(next)) return;
    closeRouteOverlays();
    scrollTop = 0;
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
    const previousKey = router.key;
    const previousOffset = scrollArea?.scrollTop;
    if (!router.sync()) return;
    if (previousOffset !== undefined) routeScrollPositions.set(previousKey, previousOffset);
    closeRouteOverlays();
    const key = router.key;
    const offset = routeScrollPositions.get(key) ?? 0;
    scrollTop = offset;
    void tick().then(() => {
      if (router.key === key && scrollArea) scrollArea.scrollTop = offset;
    });
  }

  // Entry sheet state
  let sheetOpen = $state(false);
  let sheetEntry = $state<Entry | null>(null);
  let focusEntryAmount = $state(true);
  let animateEntryOpen = $state(false);
  let previewPull = $state(0);
  let initialPull = $state(0);
  let initialVelocity = $state(0);
  let previewFrame = 0;
  let pull: { id: number; x: number; y: number; origin: number; claimed: boolean; samples: { y: number; time: number }[]; target: HTMLElement } | null = null;
  let consumeAddClick = false;

  function addDown(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0 || sheetOpen) return;
    consumeAddClick = false;
    cancelAnimationFrame(previewFrame);
    sheetEntry = null;
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    pull = { id: event.pointerId, x: event.clientX, y: event.clientY, origin: previewPull, claimed: false, samples: [{ y: event.clientY, time: event.timeStamp }], target };
  }
  function addMove(event: PointerEvent) {
    if (!pull || pull.id !== event.pointerId) return;
    const dx = event.clientX - pull.x, dy = event.clientY - pull.y;
    if (!pull.claimed && Math.max(Math.abs(dx), Math.abs(dy)) >= 8) {
      if (Math.abs(dx) >= Math.abs(dy) || (pull.origin === 0 && dy >= 0)) { pull = null; settlePreview(); return; }
      pull.claimed = true;
    }
    if (!pull.claimed) return;
    previewPull = Math.max(0, pull.origin - dy);
    pull.samples.push({ y: event.clientY, time: event.timeStamp });
    while (pull.samples.length > 2 && event.timeStamp - pull.samples[1].time > 100) pull.samples.shift();
  }
  function addEnd(event: PointerEvent) {
    if (!pull || pull.id !== event.pointerId) return;
    const gesture = pull;
    pull = null;
    if (!gesture.claimed) { settlePreview(); return; }
    consumeAddClick = true;
    setTimeout(() => { consumeAddClick = false; }, 400);
    const last = gesture.samples.at(-1)!;
    const first = gesture.samples.find(sample => event.timeStamp - sample.time <= 100) ?? last;
    const speed = (first.y - last.y) / Math.max(1, event.timeStamp - first.time);
    const commit = previewPull >= 72 || (previewPull >= 32 && speed >= 0.55);
    if (commit) {
      initialPull = previewPull;
      initialVelocity = speed;
      previewPull = 0;
      gesture.target.focus({ preventScroll: true });
      focusEntryAmount = false;
      animateEntryOpen = false;
      sheetEntry = null;
      sheetOpen = true;
    } else settlePreview();
  }
  function settlePreview() {
    cancelAnimationFrame(previewFrame);
    const from = previewPull, start = performance.now();
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 65 : 190;
    function step(now: number) {
      const progress = Math.min(1, (now - start) / duration);
      previewPull = from * (1 - progress) ** 3;
      if (progress < 1) previewFrame = requestAnimationFrame(step);
    }
    previewFrame = requestAnimationFrame(step);
  }
  function addCancel(event?: PointerEvent) {
    if (event && pull?.id !== event.pointerId) return;
    if (pull?.claimed) { consumeAddClick = true; setTimeout(() => { consumeAddClick = false; }, 400); }
    const gesture = pull;
    pull = null;
    if (event && gesture?.claimed) settlePreview();
    else { cancelAnimationFrame(previewFrame); previewPull = 0; }
    if (gesture?.target.hasPointerCapture(gesture.id)) gesture.target.releasePointerCapture(gesture.id);
  }
  $effect(() => {
    router.key; store.loading; store.error; entriesSelectMode;
    addCancel();
  });
  onMount(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const cancelForBreakpoint = () => addCancel();
    media.addEventListener('change', cancelForBreakpoint);
    return () => { media.removeEventListener('change', cancelForBreakpoint); addCancel(); };
  });

  function openAdd(event?: MouseEvent) {
    if (event && consumeAddClick) { consumeAddClick = false; return; }
    cancelAnimationFrame(previewFrame);
    previewPull = 0;
    const pointerType = event && 'pointerType' in event ? event.pointerType : '';
    // WebKit can report a touch tap as a mouse click. Keyboard clicks have detail 0.
    const touch = pointerType === 'touch' ||
      (!!event?.detail && window.matchMedia('(pointer: coarse)').matches);
    focusEntryAmount = !touch;
    initialPull = 0;
    initialVelocity = 0;
    animateEntryOpen = (event?.detail ?? 0) > 0;
    sheetEntry = null;
    sheetOpen = true;
  }

  function openEdit(entry: Entry) {
    focusEntryAmount = true;
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

  function runCommand(id: CommandId, activation?: MouseEvent): boolean {
    const session = commandSession;
    // Recheck the live context and availability after dismissal, including credential
    // rotation. No captured callback may dispatch to an obsolete Connection.
    if (!session || session.connection !== connection.current || session.mock !== mockMode.current || session.route !== router.key ||
      !(connection.current || mockMode.current) || sheetOpen || settingsOpen || openOverlays().length ||
      commands.find(command => command.id === id)?.reason !== '') return false;
    if (id === 'add') openAdd(activation);
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
    {#key router.key}
    {@const scrollOwner = router.key}
    <div class="scroll-area h-dvh overflow-y-auto overflow-x-clip {entriesSelectMode && router.current.kind === 'entries' ? 'pb-[calc(210px+env(safe-area-inset-bottom,0px))] lg:pb-[150px]' : 'pb-[calc(150px+env(safe-area-inset-bottom,0px))] lg:pb-[60px]'}" bind:this={scrollArea} onscroll={(event) => handleScroll(event, scrollOwner)}>
      {#if store.legacyWork && !mockMode.current}
        <div class="mx-4 my-4 p-4 rounded-lg border border-border bg-background">
          <p class="text-sm text-foreground">Older pending saves have no known destination. They are retained on this device and will not sync automatically.</p>
          <button class="mt-3 text-sm font-semibold text-accent cursor-pointer" onclick={() => (settingsOpen = true)}>Recover pending saves in Settings</button>
        </div>
      {/if}
      {#if store.error && !store.hasSnapshot}
        <PageHeader onsettings={() => (settingsOpen = true)}>
          {#snippet title()}{routeTitles[router.current.kind]}{/snippet}
        </PageHeader>
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
        {#if !store.error || store.hasSnapshot}
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
        {/if}
    </div>
    {/key}

    {#if !store.loading && !store.error}
      {#if scrollTop > 200}
        <button
          class="scroll-top-btn fixed {entriesSelectMode && router.current.kind === 'entries' ? 'bottom-[calc(160px+env(safe-area-inset-bottom,0px))] lg:bottom-36' : 'bottom-[calc(88px+env(safe-area-inset-bottom,0px))] lg:bottom-20'} w-11 h-11 rounded-full border border-border bg-background text-foreground flex items-center justify-center cursor-pointer z-40 shadow-card transition-colors duration-150 hover:bg-muted right-[calc(max(0px,(100vw-var(--app-max-width))/2)+72px)]"
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
      class="toast fixed {entriesSelectMode && router.current.kind === 'entries' ? 'bottom-[calc(216px+env(safe-area-inset-bottom,0px))] lg:bottom-[200px]' : 'bottom-[calc(144px+env(safe-area-inset-bottom,0px))] lg:bottom-[calc(92px+env(safe-area-inset-bottom,0px))]'} inset-x-0 mx-auto max-w-[420px] w-[calc(100%-32px)]"
      message={toast.msg}
      exiting={toast.exiting}
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

    <TabBar active={routeTab(router.current)} onchange={navigateTab} onadd={openAdd} onadddown={addDown} onaddmove={addMove} onaddend={addEnd} onaddcancel={addCancel} addAvailable={!store.loading && !store.error && !entriesSelectMode} />

    <CommandMenu open={commandOpen} {commands} opener={commandSession?.opener ?? null} onclose={() => (commandOpen = false)} onselect={runCommand} />

    <EntrySheet
      open={sheetOpen}
      {previewPull}
      {initialPull}
      {initialVelocity}
      categories={store.categories}
      entry={sheetEntry}
      focusAmountOnOpen={focusEntryAmount}
      animateOnOpen={animateEntryOpen}
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
