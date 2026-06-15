<!-- Cumulative spend pace: selected month as a solid accent line over a soft area,
     previous month as a dotted ghost on the same day-of-month axis. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';

  interface Props {
    current: number[];   // cumulative outgoing per day, full month length
    previous: number[];  // same, for the comparison month
    upToDay: number;     // days of `current` that have elapsed (month length for past months)
    curLabel: string;
    prevLabel: string;
  }

  let { current, previous, upToDay, curLabel, prevLabel }: Props = $props();

  const W = 320;
  const H = 110;
  const PAD = { l: 6, r: 6, t: 8, b: 16 };

  const domainDays = $derived(Math.max(current.length, previous.length, 2));
  const lastDay = $derived(Math.min(Math.max(upToDay, 1), current.length || 1));
  const maxVal = $derived(Math.max(current[lastDay - 1] ?? 0, previous[previous.length - 1] ?? 0, 1));

  const x = (day: number) => PAD.l + ((day - 1) / (domainDays - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + (1 - v / maxVal) * (H - PAD.t - PAD.b);

  const linePath = (vals: number[], days: number) =>
    vals.slice(0, days).map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  const curPath = $derived(linePath(current, lastDay));
  const prevPath = $derived(linePath(previous, previous.length));
  const areaPath = $derived(
    current.length
      ? `${curPath} L${x(lastDay).toFixed(1)},${(H - PAD.b).toFixed(1)} L${x(1).toFixed(1)},${(H - PAD.b).toFixed(1)} Z`
      : ''
  );
  const inProgress = $derived(lastDay < current.length);

  const draw = tweened(1, { duration: 900, easing: cubicOut });
  let appear = $state(false);
  onMount(() => {
    draw.set(0);
    requestAnimationFrame(() => (appear = true));
  });
</script>

<div class="pace-chart">
  <svg viewBox="0 0 {W} {H}" class="w-full h-auto block" role="img" aria-label="Cumulative spending, {curLabel} versus {prevLabel}">
    <!-- baseline -->
    <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="var(--border)" stroke-width="1" />

    {#if prevPath}
      <path d={prevPath} fill="none" stroke="var(--muted-foreground)" stroke-width="1.5"
        stroke-dasharray="2 4" stroke-linecap="round"
        class="transition-opacity duration-700 {appear ? 'opacity-50' : 'opacity-0'}" />
    {/if}

    {#if areaPath}
      <path d={areaPath} fill="var(--accent)"
        class="transition-opacity duration-700 {appear ? 'opacity-[0.08]' : 'opacity-0'}" />
    {/if}

    {#if curPath}
      <path d={curPath} fill="none" stroke="var(--accent)" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"
        pathLength="1" stroke-dasharray="1" stroke-dashoffset={$draw} />
      {#if inProgress}
        <line x1={x(lastDay)} y1={y(current[lastDay - 1] ?? 0)} x2={x(lastDay)} y2={H - PAD.b}
          stroke="var(--accent)" stroke-width="1" stroke-dasharray="1 3"
          class="transition-opacity duration-700 {appear ? 'opacity-60' : 'opacity-0'}" />
        <circle cx={x(lastDay)} cy={y(current[lastDay - 1] ?? 0)} r="3.5" fill="var(--accent)"
          class="transition-opacity duration-700 {appear ? 'opacity-100' : 'opacity-0'}" />
      {/if}
    {/if}

    <!-- day-of-month axis ticks -->
    <text x={PAD.l} y={H - 4} font-size="9" fill="var(--muted-foreground)" style="font-family: var(--font-mono);">1</text>
    <text x={W / 2} y={H - 4} font-size="9" fill="var(--muted-foreground)" text-anchor="middle" style="font-family: var(--font-mono);">{Math.round(domainDays / 2)}</text>
    <text x={W - PAD.r} y={H - 4} font-size="9" fill="var(--muted-foreground)" text-anchor="end" style="font-family: var(--font-mono);">{domainDays}</text>
  </svg>

  <div class="flex items-center gap-4 pt-2">
    <span class="flex items-center gap-[6px] font-sans text-[11px] font-medium text-muted-foreground">
      <span class="inline-block w-[14px] h-[2px] rounded-full bg-accent"></span>
      {curLabel}
    </span>
    {#if prevPath}
      <span class="flex items-center gap-[6px] font-sans text-[11px] font-medium text-muted-foreground">
        <span class="inline-block w-[14px] border-t-[2px] border-dotted border-muted-foreground/60"></span>
        {prevLabel}
      </span>
    {/if}
  </div>
</div>
