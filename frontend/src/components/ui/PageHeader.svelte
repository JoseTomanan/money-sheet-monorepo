<script lang="ts">
  import { getContext, type Snippet } from 'svelte';
  import { KEYBOARD_CONTEXT, type KeyboardContext } from '$lib/keyboard';
  import KeyboardHelp from './KeyboardHelp.svelte';
  import SyncStatus from './SyncStatus.svelte';
  import { COMMAND_MENU } from '$lib/commandMenu';
  import { isMac } from '$lib/keyboard';

  interface Props {
    context: Snippet;
    title: Snippet;
    meta?: Snippet;
    actions?: Snippet;
    onsettings?: () => void;
  }

  let { context, title, meta, actions, onsettings = () => {} }: Props = $props();
  const keyboardContext = getContext<() => KeyboardContext>(KEYBOARD_CONTEXT) ?? (() => 'home');
  const openCommands = getContext<() => void>(COMMAND_MENU);
</script>

<header class="page-header px-4 pt-4 pb-2 lg:px-6">
  <div class="page-header-context min-h-11 flex flex-wrap items-center justify-between gap-x-3">
    <div class="min-w-0 font-sans text-xs text-muted-foreground">
      {@render context()}
    </div>
    <div class="flex min-w-0 max-w-full flex-wrap items-center gap-1">
    <SyncStatus />
    {#if openCommands}
      <button aria-label="Open command menu" title={`Open command menu (${isMac() ? 'Cmd' : 'Ctrl'}+K)`}
        onclick={openCommands}
        class="control-link text-muted-foreground">
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
      </button>
    {/if}
    <KeyboardHelp context={keyboardContext()} />
    <button
      class="header-settings control-link gap-2 text-muted-foreground"
      onclick={onsettings}
      aria-label="Open settings"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
      <span>Settings</span>
    </button>
    </div>
  </div>

  <div class="page-header-main mt-1 flex items-end justify-between gap-3">
    <div class="min-w-0 flex items-baseline gap-[10px]">
      <div class="page-title min-w-0 font-sans text-[28px] font-semibold text-foreground tracking-[-0.5px] wrap-anywhere">
        {@render title()}
      </div>
      {#if meta}
        <div class="page-header-meta shrink-0">{@render meta()}</div>
      {/if}
    </div>
    {#if actions}
      <div class="page-header-actions shrink-0 flex items-center gap-3">{@render actions()}</div>
    {/if}
  </div>
</header>
