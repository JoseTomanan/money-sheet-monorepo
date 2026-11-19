<script lang="ts">
  import { pressFeedback } from '../../lib/pressFeedback';
  import { tick } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';
  import * as Sheet from '$lib/components/ui/sheet';
  import { fmtDate, dayOfWeek } from '$lib/format';
  import type { CategoryMap, Entry, Direction, EntryMutation, EntrySubmission } from '$lib/types';
  import { startDrag, moveDrag, endDrag, type DragState, type Snap } from '$lib/dragGesture';
  import { createEntryForm } from '$lib/entryForm.svelte';
  import SplitLegCarousel from './SplitLegCarousel.svelte';
  import { ownsKeyboard, primaryModifier } from '$lib/keyboard';
  import KeyboardHelp from '../ui/KeyboardHelp.svelte';
  import { createAddEntrySwipe } from './addEntrySwipe';
  import { fitAddEntryViewport } from './fitAddEntryViewport';

  interface Props {
    open: boolean;
    categories: CategoryMap;
    entry?: Entry | null;
    onclose: () => void;
    onsave: (m: EntryMutation) => EntrySubmission;
    ondelete?: (id: number) => EntrySubmission;
    defaultDirection?: Direction;
  }

  let { open, categories, entry = null, onclose, onsave, ondelete, defaultDirection = 'O' }: Props = $props();

  const form = createEntryForm(() => categories);
  const mobile = new MediaQuery('(width < 1024px)');
  const mobileAdd = $derived(!entry && mobile.current);
  const mobileAddLayout = 'flex flex-col overflow-hidden bottom-[var(--add-entry-viewport-bottom,0px)] max-h-[min(90dvh,calc(var(--add-entry-viewport-height,100dvh)_-_max(8px,env(safe-area-inset-top,0px))))]';
  let sheetNode = $state<HTMLDivElement | null>(null);
  let backdrop = $state<HTMLDivElement | null>(null);
  let sheetBody = $state<HTMLDivElement>();
  const swipe = createAddEntrySwipe(() => ({ sheet: sheetNode, backdrop }), closeEntry);

  function closeEntry() {
    if (mobileAdd) swipe.stop();
    clearLegacyMotion();
    onclose();
  }

  $effect(() => {
    if (open && mobileAdd && sheetNode && backdrop) return swipe.reset;
  });
  $effect(() => {
    if (open && mobileAdd && sheetNode && sheetBody) return fitAddEntryViewport(sheetNode, sheetBody);
  });

  let snap        = $state<Snap>('default');
  let activeDrag  = $state<DragState | null>(null);
  let dragOffset  = $state(0);
  let snapping    = $state(false);
  let dismissing  = $state(false);
  let springTimer: ReturnType<typeof setTimeout> | null = null;
  let springFrame = 0;
  let pointerId: number | null = null;
  let dragOrigin = 0;
  let saving = $state(false);
  let wasOpen = false;

  function clearLegacyMotion() {
    cancelAnimationFrame(springFrame);
    springFrame = 0;
    if (springTimer) clearTimeout(springTimer);
    springTimer = null;
    pointerId = null;
    activeDrag = null;
  }

  $effect(() => {
    if (open && !wasOpen) {
      clearLegacyMotion();
      form.reset(entry, defaultDirection);
      snap       = 'default';
      activeDrag = null;
      dragOffset = 0;
      snapping   = false;
      dismissing = false;
      saving = false;
      admissionError = "";
      if (springTimer) { clearTimeout(springTimer); springTimer = null; }
      void tick();
    }
    if (!open && wasOpen) clearLegacyMotion();
    wasOpen = open;
  });

  let admissionError = $state('');
  function handleSave() {
    if (saving || form.saveDisabled) return;
    saving = true;
    admissionError = '';
    const submission = onsave(form.buildMutation(entry?.id));
    if (submission.accepted) closeEntry();
    else { saving = false; admissionError = submission.error ?? 'Could not save on this device. Try again.'; }
  }
  function handleDelete() {
    if (saving || !entry || !ondelete) return;
    saving = true;
    const submission = ondelete(entry.id);
    if (submission.accepted) onclose();
    else { saving = false; admissionError = submission.error ?? 'Could not save on this device. Try again.'; }
  }

  // During drag: track finger exactly with no transition.
  // Snap-back: hold the explicit transform value (snapping=true) so the browser has a "from"
  // state when dragOffset is zeroed in the next rAF — this is what makes the CSS transition fire.
  // Dismiss: hold transform at the release point (transition:none) so the Dialog's own
  // slide-out-to-bottom exit animation uses it as the implicit "from" value, continuing
  // naturally from where the finger left off rather than snapping back to origin first.
  const contentStyle = $derived(
    activeDrag
      ? `transform: translateY(${Math.max(0, dragOffset)}px); transition: none; animation: none;`
      : snapping
        ? `transform: translateY(${dragOffset}px); transition: transform 320ms cubic-bezier(.2,.7,.2,1); animation: none;`
        : dismissing
          ? `transform: translateY(${dragOffset}px); transition: none;`
          : undefined
  );

  function onHandlePointerDown(e: PointerEvent) {
    if (pointerId !== null || !e.isPrimary || e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const painted = sheetNode ? new DOMMatrix(getComputedStyle(sheetNode).transform).m42 : 0;
    clearLegacyMotion();
    pointerId = e.pointerId;
    dragOrigin = painted;
    snapping   = false;
    dragOffset = painted;
    activeDrag = startDrag(e.clientY, snap, e.timeStamp);
  }

  function onHandlePointerMove(e: PointerEvent) {
    if (!activeDrag || pointerId !== e.pointerId) return;
    activeDrag = moveDrag(activeDrag, e.clientY, e.timeStamp);
    dragOffset = dragOrigin + activeDrag.offsetY;
  }

  function settleLegacy() {
    snapping = true;
    springFrame = requestAnimationFrame(() => {
      springFrame = requestAnimationFrame(() => {
        springFrame = 0;
        dragOffset = 0;
        springTimer = setTimeout(() => { snapping = false; springTimer = null; }, 320);
      });
    });
  }

  function onHandlePointerCancel(e: PointerEvent) {
    if (pointerId !== e.pointerId || !activeDrag) return;
    pointerId = null;
    activeDrag = null;
    settleLegacy();
  }

  function onHandlePointerUp(e: PointerEvent) {
    if (!activeDrag || pointerId !== e.pointerId) return;
    const startSnap = activeDrag.startSnap;
    const result = endDrag(activeDrag);
    pointerId = null;
    activeDrag = null;
    if (result.action === 'dismiss') {
      // Hold the drag transform so the Dialog's slide-out-to-bottom exit animation starts from
      // the finger release point. CSS animations use the underlying inline style as the implicit
      // "from" value when the 0% keyframe doesn't specify the property, so the sheet continues
      // moving downward rather than snapping back to origin before animating out.
      dismissing = true;
      onclose();
    } else {
      snap = result.to;
      if (startSnap === 'expanded' && result.to === 'default' && dragOffset > 0) {
        // Collapsing (user dragged down): skip the animated spring-back. The sheet is already below
        // rest, so a translateY→0 animation would move upward — opposing the collapse direction.
        // Let the delete-wrap max-height transition carry the visual motion instead.
        dragOffset = 0;
        snapping   = false;
      } else {
        // Two-frame snap-back: Frame 1 sets snapping=true with the current dragOffset so the
        // browser has an explicit "from" transform. Frame 2 (rAF) zeros dragOffset so the browser
        // animates translateY(offset) → translateY(0) via the CSS transition.
        settleLegacy();
      }
    }
  }
</script>

<Sheet.Root {open} onOpenChange={(v) => !v && closeEntry()} {contentStyle}
  bind:content={sheetNode} bind:overlay={backdrop} managedMotion={mobileAdd}
  initialFocus="[data-entry-amount]" fallbackFocus={() => document.querySelector<HTMLElement>('[aria-label="Add entry"]') ?? document.querySelector<HTMLElement>('[data-entry-row]')}
  class={mobileAdd ? `pb-0 ${mobileAddLayout}` : 'pb-0'} onkeydown={(event) => {
  if (event.key === 'Enter' && primaryModifier(event) && !event.shiftKey && !event.isComposing && ownsKeyboard(event.currentTarget as HTMLElement)) {
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) handleSave();
  }
}}>
  {#if !mobileAdd && admissionError}<p role="alert" class="mx-4 mt-4 text-sm text-destructive">{admissionError}</p>{/if}
  <!-- svelte-ignore a11y_no_static_element_interactions (The header supports a pointer gesture. Cancel is the keyboard equivalent.) -->
  <div class:touch-pan-x={mobileAdd} class:select-none={mobileAdd} class:shrink-0={mobileAdd}
    onpointerdown={mobileAdd ? swipe.start : undefined}
    onpointermove={mobileAdd ? swipe.move : undefined}
    onpointerup={mobileAdd ? swipe.release : undefined}
    onpointercancel={mobileAdd ? swipe.cancel : undefined}
    onlostpointercapture={mobileAdd ? swipe.cancel : undefined}
  >
  <div
    class="flex justify-center pt-[14px] pb-[10px] cursor-grab select-none active:cursor-grabbing"
    class:touch-none={!mobileAdd}
    role="separator"
    aria-label={mobileAdd ? 'Drag to dismiss' : 'Drag to resize or dismiss'}
    onpointerdown={mobileAdd ? undefined : onHandlePointerDown}
    onpointermove={mobileAdd ? undefined : onHandlePointerMove}
    onpointerup={mobileAdd ? undefined : onHandlePointerUp}
    onpointercancel={mobileAdd ? undefined : onHandlePointerCancel}
    onlostpointercapture={mobileAdd ? undefined : onHandlePointerCancel}
  >
    <div class="w-9 h-1 rounded-[2px] bg-border pointer-events-none"></div>
  </div>

  <Sheet.Header>
    <button class="header-btn cancel min-h-11 min-w-11 flex items-center justify-center bg-transparent border-0 cursor-pointer font-sans text-[15px] p-0 text-muted-foreground lg:min-h-8 lg:min-w-0" onclick={closeEntry}>Cancel</button>
    <Sheet.Title>{form.title}</Sheet.Title>
    <KeyboardHelp context="entry" />
    <button
      class="press-feedback header-btn save min-h-11 min-w-11 flex items-center justify-center bg-transparent border-0 cursor-pointer font-sans text-[15px] p-0 text-accent font-semibold disabled:opacity-40 disabled:cursor-not-allowed lg:min-h-8 lg:min-w-0"
      use:pressFeedback
      onclick={handleSave}
      disabled={form.saveDisabled || saving}
    >{saving ? 'Saving…' : 'Save'}</button>
  </Sheet.Header>
  </div>

  <div bind:this={sheetBody} class={mobileAdd ? 'min-h-0 overflow-y-auto overscroll-y-contain pb-[env(safe-area-inset-bottom,0px)]' : 'contents'}>
  {#if mobileAdd && admissionError}<p role="alert" class="mx-4 mt-4 text-sm text-destructive">{admissionError}</p>{/if}
  {#if form.saveDisabledReason && !form.split.legs.some((l) => l.error)}
    <!-- A per-leg formula error already renders inline next to its field
         (SplitLegCarousel's .leg-error) — don't repeat that message here. -->
    <p class="save-disabled-reason text-[11px] font-sans text-muted-foreground text-center -mt-1 mb-1">
      {form.saveDisabledReason}
    </p>
  {/if}

  <div class="entry-sheet-grid lg:grid lg:grid-cols-[3fr_2fr] lg:items-start lg:gap-4 lg:px-6 lg:pt-2">
  <div class="entry-sheet-primary min-w-0">
  <!-- direction toggle -->
  <div class="flex gap-2 px-4 pt-[10px] pb-1 lg:px-0 lg:pt-0">
    <button
      class="press-feedback dir-btn flex-1 py-[10px] rounded-[var(--radius-md)] border border-border bg-muted text-muted-foreground font-sans text-sm font-medium cursor-pointer"
      use:pressFeedback
      class:active-out={form.direction === 'O'}
      onclick={() => form.setDirection('O')}
    >Outgoing</button>
    <button
      class="press-feedback dir-btn flex-1 py-[10px] rounded-[var(--radius-md)] border border-border bg-muted text-muted-foreground font-sans text-sm font-medium cursor-pointer"
      use:pressFeedback
      class:active-in={form.direction === 'I'}
      onclick={() => form.setDirection('I')}
    >Incoming</button>
  </div>

  <!-- always carousel — Add leg card shown for new entries only -->
  <SplitLegCarousel
    split={form.split}
    direction={form.direction}
    {categories}
    onupdate={(i, patch) => form.updateLeg(i, patch)}
    onremove={(i) => form.removeLeg(i)}
    onadd={() => form.addLeg()}
    showAddCard={!entry}
    initialTags={entry ? [entry.tag] : undefined}
  />

  </div>
  <div class="entry-sheet-details min-w-0">
  <div class="entry-details-surface card mx-4 mt-[10px] overflow-hidden lg:mx-0 lg:mt-0">

  <!-- description -->
  <div class="py-3 px-[18px]">
    <div class="text-[10px] font-display font-semibold tracking-[1px] uppercase text-muted-foreground mb-1">Description</div>
    <input
      type="text"
      class="field-input w-full bg-transparent border-0 outline-none font-sans text-[15px] text-foreground placeholder:text-muted-foreground"
      bind:value={form.description}
      placeholder={form.direction === 'I' ? 'e.g. weekly allowance' : 'e.g. lunch at canteen'}
    />
  </div>

  <!-- date -->
  <div class="py-3 px-[18px] border-t border-border">
    <div class="text-[10px] font-display font-semibold tracking-[1px] uppercase text-muted-foreground mb-1">Date</div>
    <div class="flex items-center justify-between">
      <span class="font-mono text-[15px] text-foreground tabular-nums">{fmtDate(form.date)} · {dayOfWeek(form.date)}</span>
      <input type="date" class="text-[13px] text-accent font-sans border-0 bg-transparent cursor-pointer outline-none text-right min-w-0" bind:value={form.date} />
    </div>
  </div>
  </div>
  </div>
  </div>

  {#if entry && ondelete}
    <div class="delete-wrap" class:delete-wrap-visible={snap === 'expanded'}>
      <button
        class="delete-btn block mx-4 mt-5 mb-2 w-[calc(100%-32px)] py-[13px] rounded-[var(--radius-md)] border border-[var(--destructive-tint-border-strong)] bg-[var(--destructive-tint-strong)] text-destructive font-sans text-[15px] font-semibold cursor-pointer"
        onclick={handleDelete}
        onfocus={(event) => {
          snap = 'expanded';
          const target = event.currentTarget;
          void tick().then(() => target.scrollIntoView?.({ block: 'nearest' }));
        }}
        disabled={saving}
      >Delete entry</button>
    </div>
  {/if}
  <div class="h-8"></div>
  </div>
</Sheet.Root>

<style>
  .active-out {
    background: var(--destructive-tint-strong);
    color: var(--destructive);
    border-color: var(--destructive-tint-border);
  }
  .active-in {
    background: var(--positive-tint-bg);
    color: var(--positive);
    border-color: var(--positive-tint-border);
  }
  .delete-wrap {
    max-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    pointer-events: none;
    transition: max-height 300ms cubic-bezier(.2,.7,.2,1);
  }
  .delete-wrap-visible {
    max-height: 80px;
    pointer-events: auto;
  }
</style>
