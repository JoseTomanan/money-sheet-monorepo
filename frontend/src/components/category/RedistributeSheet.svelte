<!-- Fund Redistribution bottom sheet.
     Two category pickers (source + target) plus an amount input with
     optional formula support. Emits two AddEntryPayload legs via onsubmit:
     a negative-amount drain (source) and a positive-amount credit (target). -->
<script lang="ts">
  import * as Sheet from '../../lib/components/ui/sheet';
  import CategoryTagPicker from './CategoryTagPicker.svelte';
  import { redistributionAmount } from '../../lib/amountField';
  import { store } from '../../lib/store.svelte';
  import { today as todayStr } from '../../lib/format';
  import type { CategoryMap, AddEntryPayload, EntrySubmission } from '../../lib/types';

  interface Props {
    open: boolean;
    categories: CategoryMap;
    onclose: () => void;
    onsubmit: (legs: AddEntryPayload[]) => EntrySubmission;
  }

  let { open, categories, onclose, onsubmit }: Props = $props();

  const today = todayStr();

  let saving = $state(false);
  let admissionError = $state('');
  let source      = $state('');
  let target      = $state('');
  let amount      = $state('');
  let amountError = $state('');

  $effect(() => {
    if (open) {
      saving = false; admissionError = '';
      source      = '';
      target      = '';
      amount      = '';
      amountError = '';
    }
  });

  const evaluatedAmount = $derived(redistributionAmount.validate(amount));

  // Single source of truth for "is the typed amount acceptable" — reactive over the
  // raw string, so it catches a non-positive or malformed amount immediately, not
  // only after blur (see splitEntry.ts's validateSplit for the entry-form analogue).
  const submitDisabled = $derived(
    !source || !target || source === target || 'error' in evaluatedAmount
  );

  function handleSubmit() {
    if (saving || submitDisabled || 'error' in evaluatedAmount) return;
    saving = true;
    const parsedAmount = evaluatedAmount.value;
    const legs: AddEntryPayload[] = [
      { date: today, tag: source, description: '[REDISTRIBUTE]', direction: 'I', amount: -parsedAmount },
      { date: today, tag: target, description: '[REDISTRIBUTE]', direction: 'I', amount: parsedAmount },
    ];
    const submission = onsubmit(legs);
    if (submission.accepted) onclose();
    else { saving = false; admissionError = submission.error ?? 'Could not save on this device. Try again.'; }
  }
</script>

<Sheet.Root {open} onOpenChange={(v) => !v && onclose()}>
  {#if admissionError}<p role="alert" class="mx-4 mt-4 text-sm text-destructive">{admissionError}</p>{/if}
  <!-- handle -->
  <div class="flex justify-center pt-[14px] pb-[10px]">
    <div class="w-9 h-1 rounded-[2px] bg-border"></div>
  </div>

  <!-- header -->
  <Sheet.Header>
    <button
      class="cancel bg-transparent border-0 cursor-pointer font-sans text-[15px] p-0 text-muted-foreground"
      onclick={onclose}
    >Cancel</button>
    <Sheet.Title>Redistribute Funds</Sheet.Title>
    <button
      class="bg-transparent border-0 cursor-pointer font-sans text-[15px] p-0 text-accent font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
      onclick={handleSubmit}
      disabled={saving || submitDisabled}
    >Redistribute</button>
  </Sheet.Header>

  <div class="redistribution-layout lg:px-6 lg:pb-6">
    <!-- Amount input -->
    <div class="redistribution-amount card mx-4 mt-[10px] pt-5 pb-5 px-[22px] text-center lg:mx-auto lg:max-w-[420px]">
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
            amount = redistributionAmount.sanitize(v);
          }}
          onblur={() => {
            const result = redistributionAmount.resolve(amount);
            if (result.amount !== null) amount = result.amount;
            amountError = result.error ?? '';
          }}
          placeholder="0.00"
        />
      </div>
      {#if amountError}
        <p class="mt-1 text-[12px] font-sans text-destructive">{amountError}</p>
      {/if}
    </div>

    <div class="redistribution-pickers lg:grid lg:grid-cols-2 lg:gap-4 lg:mt-4">
      <!-- Source picker -->
      <section class="redistribution-source min-w-0 lg:rounded-[var(--radius-lg)] lg:bg-card lg:py-3 lg:shadow-[var(--shadow-card)]">
        <div class="label-overline px-5 pt-[14px] pb-[6px] lg:pt-0">From (source)</div>
        {#key open}
          <CategoryTagPicker
            direction="I"
            {categories}
            tag={source}
            onselect={(t) => (source = t)}
          />
        {/key}
      </section>

      <!-- Target picker -->
      <section class="redistribution-target min-w-0 lg:rounded-[var(--radius-lg)] lg:bg-card lg:py-3 lg:shadow-[var(--shadow-card)]">
        <div class="label-overline px-5 pt-[14px] pb-[6px] lg:pt-0">To (target)</div>
        {#key open}
          <CategoryTagPicker
            direction="I"
            {categories}
            tag={target}
            onselect={(t) => (target = t)}
          />
        {/key}
      </section>
    </div>
  </div>
</Sheet.Root>
