<script lang="ts">
  import { tick } from 'svelte';
  import * as Sheet from '$lib/components/ui/sheet';
  import { isValidTag } from '../lib/domain';
  import CategoryTagPicker from './CategoryTagPicker.svelte';
  import { fmtDate, dayOfWeek } from '../lib/format';
  import { store } from '../lib/store.svelte';
  import type { CategoryMap, Entry, AddEntryPayload, Direction, EntryMutation } from '../lib/types';
  import {
    initSplitState,
    addLeg,
    removeLeg,
    updateLeg,
    isSplitValid,
    toAddEntryPayloads,
    type SplitState,
  } from '../lib/splitEntry';
  import { isFormula, evaluateFormula } from '../lib/formula';
  import { startDrag, moveDrag, endDrag, type DragState } from '../lib/dragGesture';
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

  const today = new Date().toISOString().slice(0, 10);

  let date        = $state(today);
  let direction   = $state<Direction>('O');
  let tag         = $state('');
  let description = $state('');
  let amount      = $state('');
  let amountError = $state('');

  let splitMode = $state(false);
  let split     = $state<SplitState>(initSplitState());

  let activeDrag  = $state<DragState | null>(null);
  let dragOffset  = $state(0);
  let snapping    = $state(false);
  let dismissing  = $state(false);
  let springTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (open) {
      date        = entry?.date ?? today;
      direction   = entry?.direction ?? defaultDirection;
      tag         = entry?.tag ?? '';
      description = entry?.description ?? '';
      amount      = entry != null ? String(entry.amount) : '';
      amountError = '';
      splitMode   = false;
      split       = initSplitState();
      activeDrag  = null;
      dragOffset  = 0;
      snapping    = false;
      dismissing  = false;
      if (springTimer) { clearTimeout(springTimer); springTimer = null; }
      void tick();
    }
  });

  function handleSave() {
    if (splitMode) {
      onsave({ type: 'add', payload: toAddEntryPayloads(split, { date, description, direction }) });
    } else {
      const amt = parseFloat(amount) || 0;
      const payload: AddEntryPayload = { date, tag, description, direction, amount: amt };
      if (entry) {
        onsave({ type: 'edit', id: entry.id, patch: payload });
      } else {
        onsave({ type: 'add', payload });
      }
    }
    onclose();
  }

  const saveDisabled = $derived(
    splitMode
      ? !isSplitValid(split)
      : (!tag || !amount || !!amountError || !isValidTag(tag, direction, categories))
  );
  const title = $derived((entry ? 'Edit' : 'New') + (direction === 'I' ? ' Incoming' : ' Outgoing'));

  // During drag: track finger exactly with no transition.
  // Snap-back: hold the explicit transform value (snapping=true) so the browser has a "from"
  // state when dragOffset is zeroed in the next rAF — this is what makes the CSS transition fire.
  // Dismiss: same two-frame trick but animates to window.innerHeight instead of 0.
  // animation-duration:0s suppresses the Dialog's built-in slide-out-to-bottom so it doesn't
  // snap back to origin before playing its own exit animation.
  const contentStyle = $derived(
    activeDrag
      ? `transform: translateY(${Math.max(0, dragOffset)}px); transition: none;`
      : snapping
        ? `transform: translateY(${dragOffset}px); transition: transform 320ms cubic-bezier(.2,.7,.2,1);`
        : dismissing
          ? `transform: translateY(${dragOffset}px); transition: transform 280ms cubic-bezier(.4,0,1,1); animation-duration: 0s;`
          : undefined
  );

  function onHandlePointerDown(e: PointerEvent) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (springTimer) { clearTimeout(springTimer); springTimer = null; }
    snapping   = false;
    dragOffset = 0;
    activeDrag = startDrag(e.clientY, 'default');
  }

  function onHandlePointerMove(e: PointerEvent) {
    if (!activeDrag) return;
    activeDrag = moveDrag(activeDrag, e.clientY);
    dragOffset = activeDrag.offsetY;
  }

  function onHandlePointerUp(e: PointerEvent) {
    if (!activeDrag) return;
    const result = endDrag(activeDrag);
    activeDrag = null;
    if (result.action === 'dismiss') {
      // Two-frame dismiss: Frame 1 keeps dragOffset at the finger position so the browser has
      // an explicit "from" transform. Frame 2 (rAF) animates to window.innerHeight (off-screen).
      // We call onclose() after the animation so the sheet flies out from where the finger released,
      // not from the top. animation-duration:0s in contentStyle suppresses the Dialog's own exit
      // animation, which would otherwise snap the sheet back to origin first.
      dismissing = true;
      requestAnimationFrame(() => {
        dragOffset = window.innerHeight;
        springTimer = setTimeout(() => {
          springTimer = null;
          onclose();
        }, 280);
      });
    } else {
      // Two-frame snap-back: Frame 1 (this render) sets snapping=true with the current dragOffset
      // so the browser has an explicit "from" transform. Frame 2 (rAF) zeros dragOffset so the
      // browser animates translateY(offset) → translateY(0) via the CSS transition.
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
</script>

<Sheet.Root {open} onOpenChange={(v) => !v && onclose()} {contentStyle}>
  <!-- handle — drag down to dismiss; drag-up-to-reveal-delete is deferred -->
  <div
    class="flex justify-center pt-[14px] pb-[10px] touch-none cursor-grab select-none active:cursor-grabbing"
    role="separator"
    aria-label="Drag down to dismiss"
    onpointerdown={onHandlePointerDown}
    onpointermove={onHandlePointerMove}
    onpointerup={onHandlePointerUp}
    onpointercancel={onHandlePointerUp}
  >
    <div class="w-9 h-1 rounded-[2px] bg-border pointer-events-none"></div>
  </div>

  <Sheet.Header>
    <button class="bg-transparent border-0 cursor-pointer font-sans text-[15px] p-0 text-muted-foreground" onclick={onclose}>Cancel</button>
    <Sheet.Title>{title}</Sheet.Title>
    <button
      class="bg-transparent border-0 cursor-pointer font-sans text-[15px] p-0 text-accent font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
      onclick={handleSave}
      disabled={saveDisabled}
    >Save</button>
  </Sheet.Header>

  <!-- direction toggle -->
  <div class="flex gap-2 px-4 pt-[10px] pb-1">
    <button
      class="dir-btn flex-1 py-[10px] rounded-[var(--radius-md)] border border-border bg-muted text-muted-foreground font-sans text-sm font-medium cursor-pointer transition-[background,color] duration-150"
      class:active-out={direction === 'O'}
      onclick={() => { if (direction !== 'O') { direction = 'O'; tag = ''; splitMode = false; split = initSplitState(); } }}
    >Outgoing</button>
    <button
      class="dir-btn flex-1 py-[10px] rounded-[var(--radius-md)] border border-border bg-muted text-muted-foreground font-sans text-sm font-medium cursor-pointer transition-[background,color] duration-150"
      class:active-in={direction === 'I'}
      onclick={() => { if (direction !== 'I') { direction = 'I'; tag = ''; splitMode = false; split = initSplitState(); } }}
    >Incoming</button>
  </div>

  <!-- split toggle — only for new entries -->
  {#if !entry}
    <div class="flex items-center justify-between px-5 pt-[10px] pb-[2px]">
      <span class="text-[13px] font-sans text-muted-foreground">{direction === 'I' ? 'Split across categories' : 'Split across subcategories'}</span>
      <button
        class="split-toggle-btn py-[5px] px-[14px] rounded-[var(--radius-pill)] border border-border bg-muted text-muted-foreground font-sans text-[13px] font-medium cursor-pointer transition-[background,color] duration-150"
        class:split-active={splitMode}
        onclick={() => {
          splitMode = !splitMode;
          if (!splitMode) {
            tag    = '';
            amount = '';
            split  = initSplitState();
          }
        }}
      >{splitMode ? 'On' : 'Off'}</button>
    </div>
  {/if}

  {#if splitMode}
    <SplitLegCarousel
      {split}
      {direction}
      {categories}
      onupdate={(i, patch) => { split = updateLeg(split, i, patch); }}
      onremove={(i) => { split = removeLeg(split, i); }}
      onadd={() => { split = addLeg(split); }}
    />
  {:else}
    <!-- single amount input -->
    <div class="mx-4 mt-[10px] pt-5 pb-5 px-[22px] rounded-[var(--radius-lg)] bg-card shadow-[var(--shadow-card)] text-center">
      <div class="text-[10px] font-display font-semibold tracking-[1px] uppercase text-muted-foreground mb-2">{direction === 'I' ? 'Amount received' : 'Amount spent'}</div>
      <div class="flex justify-center items-baseline gap-1">
        <span class="font-mono text-[32px] font-medium text-muted-foreground tracking-[-0.5px]">{store.config.currency}</span>
        <input
          type="text"
          inputmode="decimal"
          class="w-[200px] bg-transparent border-0 outline-none font-mono text-[44px] font-medium text-foreground tracking-[-1.2px] text-center tabular-nums placeholder:text-muted-foreground"
          bind:value={amount}
          oninput={(e) => {
            const v = (e.target as HTMLInputElement).value;
            amount = v.startsWith('=') ? v : v.replace(/[^0-9.]/g, '');
          }}
          onblur={() => {
            if (!isFormula(amount)) { amountError = ''; return; }
            const result = evaluateFormula(amount);
            if ('error' in result) {
              amountError = 'Invalid formula';
            } else if (result.value <= 0) {
              amountError = 'Amount must be positive';
            } else {
              amount = result.value.toFixed(2);
              amountError = '';
            }
          }}
          placeholder="0.00"
        />
      </div>
      {#if amountError}
        <p class="mt-1 text-[12px] font-sans text-destructive">{amountError}</p>
      {/if}
    </div>
  {/if}

  <!-- description -->
  <div class="mx-4 mt-[10px] py-3 px-[18px] rounded-[var(--radius-md)] bg-card shadow-[var(--shadow-card)]">
    <div class="text-[10px] font-display font-semibold tracking-[1px] uppercase text-muted-foreground mb-1">Description</div>
    <input
      type="text"
      class="w-full bg-transparent border-0 outline-none font-sans text-[15px] text-foreground placeholder:text-muted-foreground"
      bind:value={description}
      placeholder={direction === 'I' ? 'e.g. weekly allowance' : 'e.g. lunch at canteen'}
    />
  </div>

  <!-- date -->
  <div class="mx-4 mt-[10px] py-3 px-[18px] rounded-[var(--radius-md)] bg-card shadow-[var(--shadow-card)]">
    <div class="text-[10px] font-display font-semibold tracking-[1px] uppercase text-muted-foreground mb-1">Date</div>
    <div class="flex items-center justify-between">
      <span class="font-mono text-[15px] text-foreground tabular-nums">{fmtDate(date)} · {dayOfWeek(date)}</span>
      <input type="date" class="text-[13px] text-accent font-sans border-0 bg-transparent cursor-pointer outline-none text-right min-w-0" bind:value={date} />
    </div>
  </div>

  <!-- single-mode tag picker -->
  {#if !splitMode}
    {#key direction}
      <CategoryTagPicker
        {direction}
        {categories}
        {tag}
        initialTag={entry?.tag ?? ''}
        onselect={(t) => (tag = t)}
      />
    {/key}
  {/if}

  {#if entry && ondelete}
    <button
      class="block mx-4 mt-5 mb-2 w-[calc(100%-32px)] py-[13px] rounded-[var(--radius-md)] border border-[var(--destructive-tint-border-strong)] bg-[var(--destructive-tint-strong)] text-destructive font-sans text-[15px] font-semibold cursor-pointer"
      onclick={() => { ondelete!(entry!.id); onclose(); }}
    >Delete entry</button>
  {/if}
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
  .split-toggle-btn.split-active {
    background: color-mix(in srgb, var(--positive) 12%, transparent);
    color: var(--positive);
    border-color: color-mix(in srgb, var(--positive) 25%, transparent);
  }
</style>
