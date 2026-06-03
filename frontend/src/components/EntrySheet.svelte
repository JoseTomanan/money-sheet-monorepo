<!-- Custom bottom-sheet with drag-to-resize/dismiss gestures (see lib/dragGesture.ts); shadcn Sheet does not expose snap points, so the bespoke implementation is retained. -->
<script lang="ts">
  import { tick } from 'svelte';
  import { isValidTag } from '../lib/domain';
  import CategoryTagPicker from './CategoryTagPicker.svelte';
  import { fmtDate, dayOfWeek } from '../lib/format';
  import { store } from '../lib/store.svelte';
  import type { CategoryMap, Entry, AddEntryPayload, UpdateEntryPatch, Direction, EntryMutation } from '../lib/types';
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
  import { startDrag, moveDrag, endDrag, type DragState, type Snap } from '../lib/dragGesture';
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
  let animOpen    = $state(false);
  let animTimer: ReturnType<typeof setTimeout> | null = null;

  let splitMode = $state(false);
  let split     = $state<SplitState>(initSplitState());

  let snap        = $state<Snap>('default');
  let activeDrag  = $state<DragState | null>(null);
  let dragOffset  = $state(0);

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
      snap        = 'default';
      activeDrag  = null;
      dragOffset  = 0;
      animTimer = setTimeout(() => { animOpen = true; }, 10);
      void tick(); // keep async flush; auto-scroll now lives inside CategoryTagPicker
    } else {
      animOpen = false;
      if (animTimer) { clearTimeout(animTimer); animTimer = null; }
    }
  });

  function handleBackdrop() {
    onclose();
  }

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

  const sheetTransform = $derived(
    activeDrag
      ? `translateX(-50%) translateY(${Math.max(0, dragOffset)}px)`
      : 'translateX(-50%) translateY(0)'
  );
  const sheetTransition = $derived(
    activeDrag ? 'none' : 'transform 320ms cubic-bezier(.2,.7,.2,1)'
  );

  function onHandlePointerDown(e: PointerEvent) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    activeDrag = startDrag(e.clientY, snap);
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
    dragOffset = 0;
    if (result.action === 'dismiss') {
      onclose();
    } else {
      snap = result.to;
    }
  }
</script>

{#if open}
  <div class="sheet-root fixed inset-0 z-[200]">
    <!-- backdrop -->
    <div
      class="backdrop absolute inset-0 bg-[rgba(26,24,20,0.4)] opacity-0 transition-[opacity] duration-[280ms] ease-[cubic-bezier(.2,.7,.2,1)]"
      class:opacity-100={animOpen}
      role="button"
      tabindex="-1"
      aria-label="Close"
      onclick={handleBackdrop}
      onkeydown={(e) => e.key === 'Escape' && handleBackdrop()}
    ></div>

    <!-- sheet -->
    <div
      class="sheet absolute bottom-0 left-1/2 w-full max-w-[var(--app-max-width)] max-h-[90dvh] bg-background rounded-tl-[28px] rounded-tr-[28px] shadow-[var(--shadow-sheet)] pb-8 overflow-y-auto overflow-x-clip"
      class:open={animOpen}
      style="transform: {animOpen ? sheetTransform : 'translateX(-50%) translateY(100%)'}; transition: {sheetTransition};"
    >
      <!-- handle -->
      <div
        class="handle-row flex justify-center pt-[14px] pb-[10px] touch-none cursor-grab select-none active:cursor-grabbing"
        role="separator"
        aria-label="Drag to resize or dismiss"
        onpointerdown={onHandlePointerDown}
        onpointermove={onHandlePointerMove}
        onpointerup={onHandlePointerUp}
        onpointercancel={onHandlePointerUp}
      >
        <div class="handle w-9 h-1 rounded-[2px] bg-border pointer-events-none"></div>
      </div>

      <!-- header -->
      <div class="sheet-header flex items-center justify-between px-5 pt-2 pb-[6px]">
        <button class="header-btn cancel bg-transparent border-0 cursor-pointer font-sans text-[15px] p-0 text-muted-foreground" onclick={onclose}>Cancel</button>
        <span class="sheet-title font-display text-base font-semibold text-foreground tracking-[-0.2px]">{title}</span>
        <button class="header-btn save bg-transparent border-0 cursor-pointer font-sans text-[15px] p-0 text-accent font-semibold disabled:opacity-40 disabled:cursor-not-allowed" onclick={handleSave} disabled={saveDisabled}>Save</button>
      </div>

      <!-- direction toggle -->
      <div class="direction-row flex gap-2 px-4 pt-[10px] pb-1">
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
        <div class="split-toggle-row flex items-center justify-between px-5 pt-[10px] pb-[2px]">
          <span class="split-toggle-label text-[13px] font-sans text-muted-foreground">{direction === 'I' ? 'Split across categories' : 'Split across subcategories'}</span>
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
        <div class="amount-card mx-4 mt-[10px] pt-5 pb-5 px-[22px] rounded-[var(--radius-lg)] bg-card shadow-[var(--shadow-card)] text-center">
          <div class="amount-label text-[10px] font-display font-semibold tracking-[1px] uppercase text-muted-foreground mb-2">{direction === 'I' ? 'Amount received' : 'Amount spent'}</div>
          <div class="amount-row flex justify-center items-baseline gap-1">
            <span class="peso-prefix font-mono text-[32px] font-medium text-muted-foreground tracking-[-0.5px]">{store.config.currency}</span>
            <input
              type="text"
              inputmode="decimal"
              class="amount-input w-[200px] bg-transparent border-0 outline-none font-mono text-[44px] font-medium text-foreground tracking-[-1.2px] text-center tabular-nums placeholder:text-muted-foreground"
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
            <p class="amount-error mt-1 text-[12px] font-sans text-destructive">{amountError}</p>
          {/if}
        </div>
      {/if}

      <!-- description -->
      <div class="field-card mx-4 mt-[10px] py-3 px-[18px] rounded-[var(--radius-md)] bg-card shadow-[var(--shadow-card)]">
        <div class="field-label text-[10px] font-display font-semibold tracking-[1px] uppercase text-muted-foreground mb-1">Description</div>
        <input
          type="text"
          class="field-input w-full bg-transparent border-0 outline-none font-sans text-[15px] text-foreground placeholder:text-muted-foreground"
          bind:value={description}
          placeholder={direction === 'I' ? 'e.g. weekly allowance' : 'e.g. lunch at canteen'}
        />
      </div>

      <!-- date -->
      <div class="field-card mx-4 mt-[10px] py-3 px-[18px] rounded-[var(--radius-md)] bg-card shadow-[var(--shadow-card)]">
        <div class="field-label text-[10px] font-display font-semibold tracking-[1px] uppercase text-muted-foreground mb-1">Date</div>
        <div class="date-row flex items-center justify-between">
          <span class="date-display font-mono text-[15px] text-foreground tabular-nums">{fmtDate(date)} · {dayOfWeek(date)}</span>
          <input type="date" class="date-input text-[13px] text-accent font-sans border-0 bg-transparent cursor-pointer outline-none text-right min-w-0" bind:value={date} />
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
        <div class="delete-wrap" class:delete-wrap-visible={snap === 'expanded'}>
          <button
            class="delete-btn block mx-4 mt-5 w-[calc(100%-32px)] py-[13px] rounded-[var(--radius-md)] border border-[rgba(193,74,50,0.3)] bg-[rgba(193,74,50,0.08)] text-destructive font-sans text-[15px] font-semibold cursor-pointer"
            onclick={() => { ondelete!(entry!.id); onclose(); }}
          >Delete entry</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .active-out {
    background: rgba(193, 74, 50, 0.12);
    color: #c14a32;
    border-color: rgba(193, 74, 50, 0.25);
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
  .delete-wrap {
    max-height: 0;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
    transition: max-height 300ms cubic-bezier(.2,.7,.2,1), opacity 220ms ease;
  }
  .delete-wrap-visible {
    max-height: 80px;
    opacity: 1;
    pointer-events: auto;
  }
</style>
