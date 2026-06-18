<!-- Fund Redistribution bottom sheet.
     Two category pickers (source + target) plus an amount input with
     optional formula support. Emits two AddEntryPayload legs via onsubmit:
     a negative-amount drain (source) and a positive-amount credit (target). -->
<script lang="ts">
  import { tick } from 'svelte';
  import CategoryTagPicker from './CategoryTagPicker.svelte';
  import { isFormula, evaluateFormula } from '../lib/formula';
  import { store } from '../lib/store.svelte';
  import type { CategoryMap, AddEntryPayload } from '../lib/types';

  interface Props {
    open: boolean;
    categories: CategoryMap;
    onclose: () => void;
    onsubmit: (legs: AddEntryPayload[]) => void;
  }

  let { open, categories, onclose, onsubmit }: Props = $props();

  const today = new Date().toISOString().slice(0, 10);

  let source      = $state('');
  let target      = $state('');
  let amount      = $state('');
  let amountError = $state('');
  let animOpen    = $state(false);
  let animTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (open) {
      source      = '';
      target      = '';
      amount      = '';
      amountError = '';
      animTimer = setTimeout(() => { animOpen = true; }, 10);
      void tick();
    } else {
      animOpen = false;
      if (animTimer) { clearTimeout(animTimer); animTimer = null; }
    }
  });

  const parsedAmount = $derived(parseFloat(amount) || 0);

  const submitDisabled = $derived(
    !source || !target || source === target || !amount || !!amountError || parsedAmount <= 0
  );

  function handleSubmit() {
    if (submitDisabled) return;
    const legs: AddEntryPayload[] = [
      { date: today, tag: source, description: '[REDISTRIBUTE]', direction: 'I', amount: -parsedAmount },
      { date: today, tag: target, description: '[REDISTRIBUTE]', direction: 'I', amount: parsedAmount },
    ];
    onsubmit(legs);
    onclose();
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
      onclick={onclose}
      onkeydown={(e) => e.key === 'Escape' && onclose()}
    ></div>

    <!-- sheet -->
    <div
      class="sheet sheet-modal"
      style="transform: {animOpen ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(100%)'}; transition: transform 320ms cubic-bezier(.2,.7,.2,1);"
    >
      <!-- handle -->
      <div class="flex justify-center pt-[14px] pb-[10px]">
        <div class="w-9 h-1 rounded-[2px] bg-border"></div>
      </div>

      <!-- header -->
      <div class="flex items-center justify-between px-5 pt-2 pb-[6px]">
        <button
          class="cancel bg-transparent border-0 cursor-pointer font-sans text-[15px] p-0 text-muted-foreground"
          onclick={onclose}
        >Cancel</button>
        <span class="font-display text-base font-semibold text-foreground tracking-[-0.2px]">Redistribute Funds</span>
        <button
          class="bg-transparent border-0 cursor-pointer font-sans text-[15px] p-0 text-accent font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          onclick={handleSubmit}
          disabled={submitDisabled}
        >Redistribute</button>
      </div>

      <!-- Amount input -->
      <div class="card mx-4 mt-[10px] pt-5 pb-5 px-[22px] text-center">
        <div class="label-overline mb-2">Amount to move</div>
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

      <!-- Source picker -->
      <div class="label-overline px-5 pt-[14px] pb-[6px]">From (source)</div>
      {#key open}
        <CategoryTagPicker
          direction="I"
          {categories}
          tag={source}
          onselect={(t) => (source = t)}
        />
      {/key}

      <!-- Target picker -->
      <div class="label-overline px-5 pt-[14px] pb-[6px]">To (target)</div>
      {#key open}
        <CategoryTagPicker
          direction="I"
          {categories}
          tag={target}
          onselect={(t) => (target = t)}
        />
      {/key}
    </div>
  </div>
{/if}
