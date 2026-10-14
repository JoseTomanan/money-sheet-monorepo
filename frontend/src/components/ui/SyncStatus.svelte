<script lang="ts">
  import { store } from '../../lib/store.svelte';
  const count = $derived(store.syncCount ?? 0);
  const retry = $derived(store.syncWaiting || (store.syncDelayed && !store.syncBusy));
</script>

<button
  class="sync-status w-[84px] min-h-11 min-w-11 flex items-center justify-end rounded-[var(--radius-sm)] bg-transparent border-0 px-2 text-xs font-sans text-muted-foreground cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:min-h-8"
  aria-label={count ? `${count} pending change${count === 1 ? '' : 's'}. ${retry ? 'Sync now' : 'Sync status'}` : store.syncing ? 'Refreshing data' : 'Refresh data'}
  onclick={() => { if (count && store.localIds.size > 0) void store.drainQueue(); else void store.refreshAll(true); }}
>
  {#if retry}Sync now{count ? ` (${count})` : ''}
  {:else if store.syncDelayed}{count ? `${count} pending` : 'Last update'}
  {:else}Sync{/if}
</button>
