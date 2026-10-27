<script lang="ts">
  import { Dialog } from 'bits-ui';
  import { store } from '../../lib/store.svelte';

  const status = $derived(store.syncStatus);
  let open = $state(false);
  const label = $derived(status.phase === 'ready' ? 'Up to date' :
    status.phase === 'busy' ? 'Syncing' : status.phase === 'waiting' ? 'Waiting to sync' : 'Sync inactive');
  const color = $derived(status.phase === 'ready' ? 'text-[var(--sync-ready)]' :
    status.phase === 'busy' ? 'text-[var(--sync-busy)]' :
    status.phase === 'waiting' ? 'text-[var(--sync-waiting)]' : 'text-muted-foreground');
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger
    class="sync-status fixed top-[env(safe-area-inset-top,0px)] left-[env(safe-area-inset-left,0px)] z-[601] size-11 flex items-center justify-center rounded-[var(--radius-sm)] bg-transparent border-0 p-0 cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
    aria-label={`Sync status. ${status.detail} Show details.`}
    title={status.detail}
    data-sync-phase={status.phase}
  >
    <span
      aria-hidden="true"
      data-sync-dot
      class={[
        'size-[7px] shrink-0 rounded-full bg-current shadow-xs', color,
        status.phase === 'busy' && 'motion-safe:animate-[shimmer_1s_ease-in-out_infinite]',
      ]}
    ></span>
  </Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-[602] bg-[var(--overlay-bg)]" />
    <Dialog.Content
      class="fixed left-1/2 top-1/2 z-[603] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-popover text-popover-foreground shadow-[var(--shadow-card)] p-5 font-sans"
    >
      <div class="flex items-center justify-between gap-3">
        <Dialog.Title class="font-display text-lg font-semibold">Sync status</Dialog.Title>
        <Dialog.Close
          aria-label="Close sync status"
          class="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border-0 bg-transparent text-muted-foreground cursor-pointer hover:text-foreground focus-visible:outline-2 focus-visible:outline-accent"
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 6 12 12M6 18 18 6" /></svg>
        </Dialog.Close>
      </div>
      <section aria-label="Sync details" role="status" class="mt-3 [overflow-wrap:anywhere]">
        <h3 class={['m-0 text-base font-semibold', color]}>{label}</h3>
        <Dialog.Description class="mt-2 mb-0 text-sm leading-relaxed">{status.detail}</Dialog.Description>
      </section>
      {#if status.action}
        <button
          class="mt-5 min-h-11 rounded-[var(--radius-sm)] border border-border bg-muted px-4 text-sm text-foreground font-medium cursor-pointer hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          onclick={() => { void store.retrySync(); }}
        >{status.action}</button>
      {/if}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
