<!-- Mirrored monthly flow chart: incoming above the baseline, outgoing below.
     Each month column is a button — tapping it re-scopes the Summary view. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { MonthFlow } from '../../lib/aggregations';
  import { monthLabel, monthShort } from '../../lib/format';

  interface Props {
    data: MonthFlow[];
    selected: string;
    onselect: (ym: string) => void;
  }

  let { data, selected, onselect }: Props = $props();

  const maxVal = $derived(Math.max(...data.map(d => Math.max(d.incoming, d.outgoing)), 1));

  // Bars rise from the baseline on first paint; CSS height transitions handle later data changes.
  let appear = $state(false);
  onMount(() => requestAnimationFrame(() => (appear = true)));

  // Non-zero values keep a 2% sliver so a month with activity never reads as empty.
  const barH = (v: number) => (!appear || v <= 0 ? 0 : Math.max((v / maxVal) * 100, 2));
</script>

<div class="flow-chart relative">
  <!-- continuous baseline behind the columns -->
  <div class="absolute inset-x-1 top-[58px] h-px bg-border" aria-hidden="true"></div>

  <div class="flex" role="group" aria-label="Monthly flow, last {data.length} months">
    {#each data as d (d.ym)}
      {@const sel = d.ym === selected}
      <button
        class="flex-1 flex flex-col items-center pt-1 pb-[2px] rounded-[10px] border-0 cursor-pointer transition-colors duration-200 {sel ? 'bg-muted' : 'bg-transparent hover:bg-muted/50'}"
        onclick={() => onselect(d.ym)}
        aria-label="Select {monthLabel(d.ym)}"
        aria-pressed={sel}
      >
        <div class="h-[54px] w-full flex items-end justify-center">
          <div
            class="w-[16px] rounded-t-[3px] transition-[height,opacity] duration-[600ms] ease-[cubic-bezier(.2,.7,.2,1)]"
            style="height: {barH(d.incoming)}%; background: var(--positive); opacity: {sel ? 0.95 : 0.35};"
          ></div>
        </div>
        <div class="h-[38px] w-full flex items-start justify-center">
          <div
            class="w-[16px] rounded-b-[3px] transition-[height,opacity] duration-[600ms] ease-[cubic-bezier(.2,.7,.2,1)]"
            style="height: {barH(d.outgoing)}%; background: var(--foreground); opacity: {sel ? 0.85 : 0.25};"
          ></div>
        </div>
        <span
          class="mt-1 font-mono text-[10px] tracking-[0.4px] uppercase transition-colors duration-200 {sel ? 'text-foreground font-semibold' : 'text-muted-foreground'}"
        >{monthShort(d.ym)}</span>
      </button>
    {/each}
  </div>
</div>
