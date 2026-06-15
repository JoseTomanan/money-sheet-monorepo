<!-- Shared inner content for a single entry row (date · stripe · description · amount).
     Renders as multiple sibling elements so they become direct flex children of the
     caller's wrapper div. The caller owns the wrapper, border, and click handlers.

     Stripe geometry note: -mt-3 / -mb-3 assume the wrapping row uses py-3 (12px).
     They cancel that padding so the stripe reaches the row's padding-box edge, letting
     adjacent split-run segments appear to meet across the 1px divider. -->
<script lang="ts">
  import type { Entry } from '../lib/types';
  import type { SplitPosition } from '../lib/groupEntries';
  import { resolveCategoryStyle } from '../lib/theme';
  import { darkMode } from '../lib/darkMode.svelte';
  import { fmtDateShort } from '../lib/format';
  import EntryDescBand from './EntryDescBand.svelte';
  import Money from './Money.svelte';

  interface Props {
    entry: Entry;
    splitPos: SplitPosition;
    local?: boolean;
  }

  let { entry, splitPos, local = false }: Props = $props();

  const catStyle = $derived(resolveCategoryStyle(entry.mainCategory));
  const resolvedColor = $derived(darkMode.current ? catStyle.darkColor : catStyle.color);
  const resolvedDot   = $derived(darkMode.current ? catStyle.darkDot   : catStyle.dot);
</script>

<span class="entry-date-lead font-mono text-[11px] font-normal tabular-nums text-muted-foreground whitespace-nowrap shrink-0">{fmtDateShort(entry.date)}</span>

{#if entry.direction === 'O'}
  <span
    class="entry-stripe self-stretch w-[4.5px] shrink-0 opacity-80"
    class:-mt-3={splitPos.inGroup && !splitPos.isFirst}
    class:-mb-3={splitPos.inGroup && !splitPos.isLast}
    style="background: {resolvedDot};"
    aria-hidden="true"
  ></span>
{/if}

<EntryDescBand
  description={entry.description}
  pastel={catStyle.pastel}
  color={resolvedColor}
  direction={entry.direction}
/>

<div class="entry-amount-wrap shrink-0 ml-auto flex items-center gap-1">
  {#if local}
    <span class="text-[11px] text-muted-foreground leading-none" data-local-indicator aria-label="Not yet synced">↑</span>
  {/if}
  <Money
    value={entry.amount}
    size={14}
    weight={500}
    negColor={entry.direction === 'I' && entry.amount < 0}
    positive={entry.direction === 'I' && entry.amount >= 0}
  />
</div>
