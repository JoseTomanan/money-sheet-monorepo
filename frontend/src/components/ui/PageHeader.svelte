<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    context: Snippet;
    title: Snippet;
    meta?: Snippet;
    actions?: Snippet;
    onsettings?: () => void;
  }

  let { context, title, meta, actions, onsettings = () => {} }: Props = $props();
</script>

<header class="page-header px-4 pt-4 pb-2 lg:px-6 lg:pt-6 lg:pb-3">
  <div class="page-header-context min-h-11 flex items-center justify-between gap-3 lg:min-h-8">
    <div class="min-w-0 font-display text-xs font-semibold tracking-[1.2px] uppercase text-muted-foreground">
      {@render context()}
    </div>
    <button
      class="header-settings min-h-11 min-w-11 -mr-2 flex items-center justify-center gap-[6px] rounded-[var(--radius-sm)] border-0 bg-transparent px-2 font-sans text-[12px] font-medium text-muted-foreground cursor-pointer hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:min-h-8 lg:min-w-0 lg:mr-0"
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

  <div class="page-header-main mt-1 flex items-end justify-between gap-3">
    <div class="min-w-0 flex items-baseline gap-[10px]">
      <div class="page-title min-w-0 font-display text-[28px] font-bold text-foreground tracking-[-0.5px] lg:text-[30px]">
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
