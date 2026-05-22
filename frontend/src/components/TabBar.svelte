<script lang="ts">
  export type TabId = 'home' | 'entries' | 'summary';

  interface Props {
    active: TabId;
    onchange: (tab: TabId) => void;
  }

  let { active, onchange }: Props = $props();

  const tabs: { id: TabId; label: string }[] = [
    { id: 'home',    label: 'Home' },
    { id: 'entries', label: 'Entries' },
    { id: 'summary', label: 'Summary' },
  ];
</script>

<div class="tab-bar-outer">
  <div class="tab-bar-pill">
    {#each tabs as tab}
      <button
        class="tab-btn"
        class:active={active === tab.id}
        onclick={() => onchange(tab.id)}
        aria-current={active === tab.id ? 'page' : undefined}
      >
        <span class="tab-icon" aria-hidden="true">
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
        <span class="tab-label">{tab.label}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .tab-bar-outer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 90;
    pointer-events: none;
    display: flex;
    justify-content: center;
  }

  .tab-bar-pill {
    display: flex;
    align-items: center;
    justify-content: space-around;
    width: 100%;
    max-width: var(--app-max-width);
    height: 60px;
    padding: 0 8px env(safe-area-inset-bottom, 0px);
    border-radius: 0;
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    box-shadow: var(--shadow-tabbar);
    pointer-events: all;
  }

  .tab-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 6px 0;
    background: none;
    border: 0;
    cursor: pointer;
    color: var(--muted-foreground);
    font-family: var(--font-sans);
    transition: color 150ms;
  }

  .tab-btn.active {
    color: var(--accent);
  }

  .tab-label {
    font-family: var(--font-display);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.2px;
    margin-top: 2px;
  }
</style>
