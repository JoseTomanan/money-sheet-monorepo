<!-- Custom mobile bottom tab bar; shadcn has no native tab-bar primitive. -->
<script lang="ts">
  export type TabId = 'home' | 'entries' | 'summary';

  interface Props {
    active: TabId;
    onchange: (tab: TabId) => void;
    onadd: (event: MouseEvent) => void;
    oncancel: (event: MouseEvent) => void;
    oncancelpointerdown: (event: PointerEvent) => void;
    selecting: boolean;
    addAvailable: boolean;
    height?: number;
  }

  let { active, onchange, onadd, oncancel, oncancelpointerdown, selecting, addAvailable, height = $bindable(64) }: Props = $props();

  const tabs: { id: TabId; label: string }[] = [
    { id: 'home',    label: 'Home' },
    { id: 'entries', label: 'Entries' },
    { id: 'summary', label: 'Summary' },
  ];
</script>

<div class="tab-bar-outer fixed bottom-[calc(16px+env(safe-area-inset-bottom,0px))] lg:bottom-0 left-0 right-0 z-[90] pointer-events-none flex justify-center pl-[calc(16px+env(safe-area-inset-left,0px))] pr-[calc(16px+env(safe-area-inset-right,0px))] lg:px-0">
  <div bind:offsetHeight={height} class="tab-bar-pill flex items-center justify-around w-full max-w-[420px] min-h-[64px] px-2 rounded-2xl border border-border bg-dock/95 backdrop-blur-[20px] backdrop-saturate-[180%] shadow-[var(--shadow-tabbar)] pointer-events-auto lg:w-full lg:max-w-[var(--app-max-width)] lg:h-[52px] lg:min-h-0 lg:px-6 lg:pb-[env(safe-area-inset-bottom,0px)] lg:rounded-none lg:border-0 lg:bg-dock/90 [@media(prefers-reduced-transparency:reduce)]:bg-dock [@media(prefers-reduced-transparency:reduce)]:backdrop-filter-none">
    {#each tabs as tab}
      <button
        data-app-navigation={tab.id}
        class="tab-btn group/tab flex-1 min-w-0 min-h-[44px] flex flex-col items-center justify-center gap-[2px] py-[6px] rounded-xl bg-transparent border-0 cursor-pointer touch-manipulation font-sans focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
        class:text-accent={active === tab.id}
        class:text-muted-foreground={active !== tab.id}
        onclick={() => onchange(tab.id)}
        aria-current={active === tab.id ? 'page' : undefined}
      >
        <span
          class="tab-icon rounded-[var(--radius-pill)] px-[14px] py-1 bg-transparent group-active/tab:inset-ring-2 group-active/tab:inset-ring-foreground/25"
          class:active-icon={active === tab.id}
          aria-hidden="true"
        >
          {#if tab.id === 'home'}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 9.5L12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1V9.5z"/>
            </svg>
          {:else if tab.id === 'entries'}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="4" y1="7" x2="20" y2="7"/>
              <line x1="4" y1="12" x2="20" y2="12"/>
              <line x1="4" y1="17" x2="14" y2="17"/>
            </svg>
          {:else}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="6"  y1="20" x2="6"  y2="13"/>
              <line x1="12" y1="20" x2="12" y2="4"/>
              <line x1="18" y1="20" x2="18" y2="9"/>
            </svg>
          {/if}
        </span>
        <span class="tab-label font-display text-[clamp(12px,0.75rem,18px)] lg:text-[10px] tracking-[0.2px] mt-[2px] leading-tight text-center [overflow-wrap:anywhere]" class:font-bold={active === tab.id} class:font-medium={active !== tab.id}>{tab.label}</span>
      </button>
    {/each}
    {#if selecting}
      <button data-dock-cancel onpointerdown={oncancelpointerdown} onclick={oncancel} class="lg:hidden min-h-[44px] min-w-[44px] flex-1 rounded-xl text-[clamp(14px,0.875rem,18px)] font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-accent">Cancel</button>
    {:else}
      <button data-dock-add onclick={onadd} disabled={!addAvailable} aria-label="Add entry" class="lg:hidden min-h-[44px] min-w-[44px] flex-1 rounded-xl bg-accent-fill text-accent-foreground text-[clamp(14px,0.875rem,18px)] font-semibold disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:opacity-80">+ Add</button>
    {/if}
  </div>
</div>

<style>
  .active-icon {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }
</style>
