<script lang="ts">
  import { store } from '../../lib/store.svelte';
  let { statistics = false }: { statistics?: boolean } = $props();
</script>

<p class="balance-status min-h-4 mx-4 mt-1 mb-2 text-[11px] font-sans text-muted-foreground lg:mx-6" role="status">
  {#if statistics && store.hasStats === false}Statistics awaiting first update
  {:else if store.hasSnapshot === false}Balances awaiting first update
  {:else if store.balancesStale || (statistics && store.statisticsAwaitingSync)}Balances awaiting sync
  {:else if store.lastUpdated}Last updated {new Date(store.lastUpdated).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}
  {:else}Last confirmed update{/if}
</p>
