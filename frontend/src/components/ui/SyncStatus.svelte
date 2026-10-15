<script lang="ts">
  import { Popover } from 'bits-ui';
  import { store } from '../../lib/store.svelte';

  const status = $derived(store.syncStatus);
  let open = $state(false);
  let trigger: HTMLButtonElement | null = $state(null);
  let recovery: HTMLButtonElement | undefined = $state();
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    bind:ref={trigger}
    class="sync-status size-11 shrink-0 flex items-center justify-center rounded-[var(--radius-sm)] bg-transparent border-0 p-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:size-8"
    aria-label={`Sync status. ${status.detail} Show details.`}
    title={status.detail}
    data-sync-phase={status.phase}
    onkeydown={event => {
      if (open && recovery && event.key === 'Tab' && !event.shiftKey) {
        event.preventDefault();
        recovery.focus();
      }
    }}
  >
    <span
      aria-hidden="true"
      data-sync-dot
      class={[
        'size-[7px] shrink-0 rounded-full',
        status.phase === 'ready' ? 'bg-green-600 dark:bg-green-400' :
        status.phase === 'busy' ? 'bg-blue-600 dark:bg-blue-400 motion-safe:animate-[shimmer_1s_ease-in-out_infinite]' :
        status.phase === 'waiting' ? 'bg-red-600 dark:bg-red-400' : 'bg-muted-foreground',
      ]}
    ></span>
  </Popover.Trigger>
  <Popover.Portal>
    <Popover.Content
      align="end"
      sideOffset={4}
      trapFocus={false}
      onOpenAutoFocus={event => event.preventDefault()}
      class="z-50 w-64 max-w-[calc(100vw-2rem)] rounded-[var(--radius-md)] border border-border bg-popover text-popover-foreground shadow-[var(--shadow-card)] p-3 font-sans text-xs"
    >
      <section aria-label="Sync details">
        <p role="status" class="m-0 leading-relaxed">{status.detail}</p>
        {#if status.action}
          <button
            bind:this={recovery}
            class="mt-2 min-h-11 rounded-[var(--radius-sm)] border-0 bg-transparent px-2 text-accent font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:min-h-8"
            onclick={() => { void store.retrySync(); }}
            onkeydown={event => {
              if (event.key === 'Tab' && event.shiftKey) {
                event.preventDefault();
                trigger?.focus();
              }
            }}
          >{status.action}</button>
        {/if}
      </section>
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
