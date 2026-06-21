<script lang="ts">
  import { tick } from 'svelte';
  import * as Sheet from '$lib/components/ui/sheet';
  import { fmtDate, dayOfWeek } from '$lib/format';
  import type { CategoryMap, Entry, Direction, EntryMutation } from '$lib/types';
  import { startDrag, moveDrag, endDrag, type DragState, type Snap } from '$lib/dragGesture';
  import { createEntryForm } from '$lib/entryForm.svelte';
  import SplitLegCarousel from './SplitLegCarousel.svelte';

  interface Props {
    open: boolean;
    categories: CategoryMap;
    entry?: Entry | null;
    onclose: () => void;
    onsave: (m: EntryMutation) => void;
    ondelete?: (id: number) => void;
    defaultDirection?: Direction;
  }

  let { open, categories, entry = null, onclose, onsave, ondelete, defaultDirection = 'O' }: Props = $props();

  const form = createEntryForm(() => categories);

  let snap        = $state<Snap>('default');
  let activeDrag  = $state<DragState | null>(null);
  let dragOffset  = $state(0);
  let snapping    = $state(false);
  let dismissing  = $state(false);
  let springTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (open) {
      form.reset(entry, defaultDirection);
      snap       = 'default';
      activeDrag = null;
      dragOffset = 0;
      snapping   = false;
      dismissing = false;
      if (springTimer) { clearTimeout(springTimer); springTimer = null; }
      void tick();
    }
  });

  function handleSave() {
    onsave(form.buildMutation(entry?.id));
    onclose();
  }

  // During drag: track finger exactly with no transition.
  // Snap-back: hold the explicit transform value (snapping=true) so the browser has a "from"
  // state when dragOffset is zeroed in the next rAF — this is what makes the CSS transition fire.
  // Dismiss: hold transform at the release point (transition:none) so the Dialog's own
  // slide-out-to-bottom exit animation uses it as the implicit "from" value, continuing
  // naturally from where the finger left off rather than snapping back to origin first.
  const contentStyle = $derived(
    activeDrag
      ? `transform: translateY(${Math.max(0, dragOffset)}px); transition: none;`
      : snapping
        ? `transform: translateY(${dragOffset}px); transition: transform 320ms cubic-bezier(.2,.7,.2,1);`
        : dismissing
          ? `transform: translateY(${dragOffset}px); transition: none;`
          : undefined
  );

  function onHandlePointerDown(e: PointerEvent) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (springTimer) { clearTimeout(springTimer); springTimer = null; }
    snapping   = false;
    dragOffset = 0;
    activeDrag = startDrag(e.clientY, snap, e.timeStamp);
  }

  function onHandlePointerMove(e: PointerEvent) {
    if (!activeDrag) return;
    activeDrag = moveDrag(activeDrag, e.clientY, e.timeStamp);
    dragOffset = activeDrag.offsetY;
  }

  function onHandlePointerUp(e: PointerEvent) {
    if (!activeDrag) return;
    const result = endDrag(activeDrag);
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
      if (result.to === 'default' && dragOffset > 0) {
        // Collapsing (user dragged down): skip the animated spring-back. The sheet is already below
        // rest, so a translateY→0 animation would move upward — opposing the collapse direction.
        // Let the delete-wrap max-height transition carry the visual motion instead.
        dragOffset = 0;
        snapping   = false;
      } else {
        // Two-frame snap-back: Frame 1 sets snapping=true with the current dragOffset so the
        // browser has an explicit "from" transform. Frame 2 (rAF) zeros dragOffset so the browser
        // animates translateY(offset) → translateY(0) via the CSS transition.
        snapping = true;
        requestAnimationFrame(() => {
          dragOffset = 0;
          springTimer = setTimeout(() => {
            snapping    = false;
            springTimer = null;
          }, 320);
        });
      }
    }
  }
</script>

<Sheet.Root {open} onOpenChange={(v) => !v && onclose()} {contentStyle} class="pb-0">
  <!-- handle — drag down to dismiss, drag up to reveal Delete button -->
  <div
    class="flex justify-center pt-[14px] pb-[10px] touch-none cursor-grab select-none active:cursor-grabbing"
    role="separator"
    aria-label="Drag to resize or dismiss"
    onpointerdown={onHandlePointerDown}
    onpointermove={onHandlePointerMove}
    onpointerup={onHandlePointerUp}
    onpointercancel={onHandlePointerUp}
  >
    <div class="w-9 h-1 rounded-[2px] bg-border pointer-events-none"></div>
  </div>

  <Sheet.Header>
    <button class="header-btn cancel bg-transparent border-0 cursor-pointer font-sans text-[15px] p-0 text-muted-foreground" onclick={onclose}>Cancel</button>
    <Sheet.Title>{form.title}</Sheet.Title>
    <button
      class="header-btn save bg-transparent border-0 cursor-pointer font-sans text-[15px] p-0 text-accent font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
      onclick={handleSave}
      disabled={form.saveDisabled}
    >Save</button>
  </Sheet.Header>

  <!-- direction toggle -->
  <div class="flex gap-2 px-4 pt-[10px] pb-1">
    <button
      class="dir-btn flex-1 py-[10px] rounded-[var(--radius-md)] border border-border bg-muted text-muted-foreground font-sans text-sm font-medium cursor-pointer transition-[background,color] duration-150"
      class:active-out={form.direction === 'O'}
      onclick={() => form.setDirection('O')}
    >Outgoing</button>
    <button
      class="dir-btn flex-1 py-[10px] rounded-[var(--radius-md)] border border-border bg-muted text-muted-foreground font-sans text-sm font-medium cursor-pointer transition-[background,color] duration-150"
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

  <!-- description -->
  <div class="mx-4 mt-[10px] py-3 px-[18px] rounded-[var(--radius-md)] bg-card shadow-[var(--shadow-card)]">
    <div class="text-[10px] font-display font-semibold tracking-[1px] uppercase text-muted-foreground mb-1">Description</div>
    <input
      type="text"
      class="field-input w-full bg-transparent border-0 outline-none font-sans text-[15px] text-foreground placeholder:text-muted-foreground"
      bind:value={form.description}
      placeholder={form.direction === 'I' ? 'e.g. weekly allowance' : 'e.g. lunch at canteen'}
    />
  </div>

  <!-- date -->
  <div class="mx-4 mt-[10px] py-3 px-[18px] rounded-[var(--radius-md)] bg-card shadow-[var(--shadow-card)]">
    <div class="text-[10px] font-display font-semibold tracking-[1px] uppercase text-muted-foreground mb-1">Date</div>
    <div class="flex items-center justify-between">
      <span class="font-mono text-[15px] text-foreground tabular-nums">{fmtDate(form.date)} · {dayOfWeek(form.date)}</span>
      <input type="date" class="text-[13px] text-accent font-sans border-0 bg-transparent cursor-pointer outline-none text-right min-w-0" bind:value={form.date} />
    </div>
  </div>

  {#if entry && ondelete}
    <div class="delete-wrap" class:delete-wrap-visible={snap === 'expanded'}>
      <button
        class="delete-btn block mx-4 mt-5 mb-2 w-[calc(100%-32px)] py-[13px] rounded-[var(--radius-md)] border border-[var(--destructive-tint-border-strong)] bg-[var(--destructive-tint-strong)] text-destructive font-sans text-[15px] font-semibold cursor-pointer"
        onclick={() => { ondelete!(entry!.id); onclose(); }}
      >Delete entry</button>
    </div>
  {/if}
  <div class="h-8"></div>
</Sheet.Root>

<style>
  .active-out {
    background: var(--destructive-tint-strong);
    color: var(--destructive);
    border-color: var(--destructive-tint-border);
  }
  .active-in {
    background: color-mix(in srgb, var(--positive) 12%, transparent);
    color: var(--positive);
    border-color: color-mix(in srgb, var(--positive) 25%, transparent);
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
