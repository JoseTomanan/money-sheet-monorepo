<script lang="ts">
  import { Dialog } from 'bits-ui';
  import { store } from '../../lib/store.svelte';

  const status = $derived(store.syncStatus);
  let open = $state(false);
  let pointerMotion = $state(false);
  let pendingPointer = false;
  let pointerTarget: EventTarget | null = null;
  let outsidePending = false;
  let outsideCompleted = false;
  let content: HTMLElement | null = $state(null);
  let overlay: HTMLElement | null = $state(null);
  let activationTimer: ReturnType<typeof setTimeout> | undefined;

  function pointerDown(event: PointerEvent) {
    outsidePending = false;
    outsideCompleted = false;
    pointerTarget = event.isTrusted && event.button === 0 ? event.target : null;
  }
  function pointerCancel() { pointerTarget = null; outsidePending = false; outsideCompleted = false; }
  function activation(event: MouseEvent) {
    const target = event.target instanceof Element ? event.target : null;
    const origin = pointerTarget instanceof Element ? pointerTarget : null;
    const completed = !!pointerTarget && event.isTrusted && event.detail > 0;
    if (completed && target?.closest('[data-sync-overlay]') && pointerTarget === event.target) {
      outsideCompleted = true;
      if (outsidePending && open) {
        pendingPointer = true;
        outsidePending = false;
        changeOpen(false);
      }
    }
    const activationTarget = target?.closest('[data-sync-activation]');
    pendingPointer = completed && !!activationTarget && origin?.closest('[data-sync-activation]') === activationTarget;
    pointerTarget = null;
    // Bits' target handler runs after capture; discard unused provenance after this event.
    clearTimeout(activationTimer);
    activationTimer = setTimeout(() => { pendingPointer = false; }, 0);
  }
  function changeOpen(value: boolean) {
    pointerMotion = pendingPointer;
    pendingPointer = false;
    open = value;
  }
  function keyboard() {
    pendingPointer = false;
    pointerTarget = null;
    outsidePending = false;
    outsideCompleted = false;
    settleMotion();
  }
  function settleMotion() {
    pointerMotion = false;
    for (const node of [content, overlay]) node?.getAnimations?.().forEach(animation => animation.cancel());
  }
  $effect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    media.addEventListener('change', settleMotion);
    return () => { media.removeEventListener('change', settleMotion); clearTimeout(activationTimer); };
  });
  const label = $derived(status.phase === 'ready' ? 'Up to date' :
    status.phase === 'busy' ? 'Syncing' : status.phase === 'waiting' ? 'Waiting to sync' : 'Sync inactive');
  const color = $derived(status.phase === 'ready' ? 'text-[var(--sync-ready)]' :
    status.phase === 'busy' ? 'text-[var(--sync-busy)]' :
    status.phase === 'waiting' ? 'text-[var(--sync-waiting)]' : 'text-muted-foreground');
</script>

<svelte:window onpointerdowncapture={pointerDown} onpointercancelcapture={pointerCancel} onclickcapture={activation} onkeydowncapture={keyboard} />

<Dialog.Root {open} onOpenChange={changeOpen}>
  <Dialog.Trigger
    data-sync-activation
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
    <Dialog.Overlay bind:ref={overlay} data-sync-overlay data-sync-motion={pointerMotion ? '' : undefined} class="sync-modal-overlay fixed inset-0 z-[602] bg-[var(--overlay-bg)]" />
    <Dialog.Content
      bind:ref={content}
      data-sync-motion={pointerMotion ? '' : undefined}
      onInteractOutside={(event) => {
        // Bits reports mouse/pen outside interaction on pointerdown. Wait for a
        // completed click so a cancelled gesture cannot dismiss the dialog.
        if (event.type === 'pointerdown' && !outsideCompleted) {
          event.preventDefault();
          outsidePending = true;
        } else {
          pendingPointer = event.isTrusted && (!!event.pointerType || event.detail > 0);
          outsideCompleted = false;
        }
      }}
      class="sync-modal-content fixed left-1/2 top-1/2 z-[603] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-popover text-popover-foreground shadow-[var(--shadow-card)] p-5 font-sans"
    >
      <div class="flex items-center justify-between gap-3">
        <Dialog.Title class="font-display text-lg font-semibold">Sync status</Dialog.Title>
        <Dialog.Close
          data-sync-activation
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
