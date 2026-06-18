<!-- Custom bottom-sheet with drag-to-resize/dismiss gestures (see lib/dragGesture.ts); shadcn Sheet does not expose snap points, so the bespoke implementation is retained. -->
<script lang="ts">
  import { tick } from 'svelte';
  import CategoryTagPicker from '../category/CategoryTagPicker.svelte';
  import { fmtDate, dayOfWeek } from '../../lib/format';
  import { store } from '../../lib/store.svelte';
  import type { CategoryMap, Entry, Direction, EntryMutation } from '../../lib/types';
  import { startDrag, moveDrag, endDrag, type DragState, type Snap } from '../../lib/dragGesture';
  import { createEntryForm } from '../../lib/entryForm.svelte';
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

  let animOpen   = $state(false);
  let animTimer: ReturnType<typeof setTimeout> | null = null;
  let snap       = $state<Snap>('default');
  let activeDrag = $state<DragState | null>(null);
  let dragOffset = $state(0);

  $effect(() => {
    if (open) {
      form.reset(entry, defaultDirection);
      snap       = 'default';
      activeDrag = null;
      dragOffset = 0;
      animTimer  = setTimeout(() => { animOpen = true; }, 10);
      void tick(); // keep async flush; auto-scroll now lives inside CategoryTagPicker
    } else {
      animOpen = false;
      if (animTimer) { clearTimeout(animTimer); animTimer = null; }
    }
  });

  function handleSave() {
    onsave(form.buildMutation(entry?.id));
    onclose();
  }

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
      class="backdrop absolute inset-0 bg-[var(--overlay-bg)] opacity-0 transition-[opacity] duration-[280ms] ease-[cubic-bezier(.2,.7,.2,1)]"
      class:opacity-100={animOpen}
      role="button"
      tabindex="-1"
      aria-label="Close"
      onclick={handleBackdrop}
      onkeydown={(e) => e.key === 'Escape' && handleBackdrop()}
    ></div>

    <!-- sheet -->
    <div
      class="sheet sheet-modal"
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
        <span class="sheet-title font-display text-base font-semibold text-foreground tracking-[-0.2px]">{form.title}</span>
        <button class="header-btn save bg-transparent border-0 cursor-pointer font-sans text-[15px] p-0 text-accent font-semibold disabled:opacity-40 disabled:cursor-not-allowed" onclick={handleSave} disabled={form.saveDisabled}>Save</button>
      </div>

      <!-- direction toggle -->
      <div class="direction-row flex gap-2 px-4 pt-[10px] pb-1">
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

      <!-- split toggle — only for new entries -->
      {#if !entry}
        <div class="split-toggle-row flex items-center justify-between px-5 pt-[10px] pb-[2px]">
          <span class="split-toggle-label text-[13px] font-sans text-muted-foreground">{form.direction === 'I' ? 'Split across categories' : 'Split across subcategories'}</span>
          <button
            class="split-toggle-btn py-[5px] px-[14px] rounded-[var(--radius-pill)] border border-border bg-muted text-muted-foreground font-sans text-[13px] font-medium cursor-pointer transition-[background,color] duration-150"
            class:split-active={form.splitMode}
            onclick={() => form.toggleSplit()}
          >{form.splitMode ? 'On' : 'Off'}</button>
        </div>
      {/if}

      {#if form.splitMode}
        <SplitLegCarousel
          split={form.split}
          direction={form.direction}
          {categories}
          onupdate={(i, patch) => form.updateLeg(i, patch)}
          onremove={(i) => form.removeLeg(i)}
          onadd={() => form.addLeg()}
        />
      {:else}
        <!-- single amount input -->
        <div class="amount-card card mx-4 mt-[10px] pt-5 pb-5 px-[22px] text-center">
          <div class="amount-label label-overline mb-2">{form.direction === 'I' ? 'Amount received' : 'Amount spent'}</div>
          <div class="amount-row flex justify-center items-baseline gap-1">
            <span class="peso-prefix font-mono text-[32px] font-medium text-muted-foreground tracking-[-0.5px]">{store.config.currency}</span>
            <input
              type="text"
              inputmode="decimal"
              class="amount-input w-[200px] bg-transparent border-0 outline-none font-mono text-[44px] font-medium text-foreground tracking-[-1.2px] text-center tabular-nums placeholder:text-muted-foreground"
              value={form.amount}
              oninput={(e) => form.sanitizeAmountInput((e.target as HTMLInputElement).value)}
              onblur={() => form.evaluateAmount()}
              placeholder="0.00"
            />
          </div>
          {#if form.amountError}
            <p class="amount-error mt-1 text-[12px] font-sans text-destructive">{form.amountError}</p>
          {/if}
        </div>
      {/if}

      <!-- description -->
      <div class="field-card mx-4 mt-[10px]">
        <div class="field-label label-overline mb-1">Description</div>
        <input
          type="text"
          class="field-input w-full bg-transparent border-0 outline-none font-sans text-[15px] text-foreground placeholder:text-muted-foreground"
          bind:value={form.description}
          placeholder={form.direction === 'I' ? 'e.g. weekly allowance' : 'e.g. lunch at canteen'}
        />
      </div>

      <!-- date -->
      <div class="field-card mx-4 mt-[10px]">
        <div class="field-label label-overline mb-1">Date</div>
        <div class="date-row flex items-center justify-between">
          <span class="date-display font-mono text-[15px] text-foreground tabular-nums">{fmtDate(form.date)} · {dayOfWeek(form.date)}</span>
          <input type="date" class="date-input text-[13px] text-accent font-sans border-0 bg-transparent cursor-pointer outline-none text-right min-w-0" bind:value={form.date} />
        </div>
      </div>

      <!-- single-mode tag picker -->
      {#if !form.splitMode}
        {#key form.direction}
          <CategoryTagPicker
            direction={form.direction}
            {categories}
            tag={form.tag}
            initialTag={entry?.tag ?? ''}
            onselect={(t) => (form.tag = t)}
          />
        {/key}
      {/if}

      {#if entry && ondelete}
        <div class="delete-wrap" class:delete-wrap-visible={snap === 'expanded'}>
          <button
            class="delete-btn block mx-4 mt-5 w-[calc(100%-32px)] py-[13px] rounded-[var(--radius-md)] border border-[var(--destructive-tint-border-strong)] bg-[var(--destructive-tint-strong)] text-destructive font-sans text-[15px] font-semibold cursor-pointer"
            onclick={() => { ondelete!(entry!.id); onclose(); }}
          >Delete entry</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

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
