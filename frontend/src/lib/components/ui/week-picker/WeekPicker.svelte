<script lang="ts">
  import { Popover } from 'bits-ui';
  import { cn } from '$lib/utils';

  interface Week { key: string; label: string; }

  interface Props {
    weeks: Week[];
    currentWeekKey: string;
    value: string;
    onSelect: (key: string) => void;
  }

  let { weeks, currentWeekKey, value, onSelect }: Props = $props();

  let open = $state(false);

  const triggerLabel = $derived(weeks.find(w => w.key === value)?.label ?? value);
  const currentWeek = $derived(weeks.find(w => w.key === currentWeekKey));
  const pastWeeks   = $derived([...weeks.filter(w => w.key !== currentWeekKey)].reverse());

  function select(key: string) {
    onSelect(key);
    open = false;
  }
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    data-week-trigger
    class="flex items-center gap-[3px] cursor-pointer font-display text-xs font-semibold tracking-[1.2px] uppercase text-muted-foreground bg-transparent border-0 p-0 outline-none"
  >
    {triggerLabel}
    <svg class="text-muted-foreground pointer-events-none shrink-0 opacity-70 ml-[1px]" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  </Popover.Trigger>

  <Popover.Portal>
    <Popover.Content
      class={cn(
        'z-50 min-w-[220px] rounded-[var(--radius-md)] border border-border bg-popover text-popover-foreground shadow-[var(--shadow-card)] p-1',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
      )}
      sideOffset={6}
    >
      {#if currentWeek}
        <div data-this-week-heading class="px-2 pt-1 pb-[2px] text-[10px] font-semibold tracking-[0.8px] uppercase text-muted-foreground font-display">This week</div>
        <button
          data-week-row
          data-week-key={currentWeek.key}
          class={cn(
            'w-full text-left px-2 py-[6px] rounded-[var(--radius-sm)] text-xs font-sans cursor-pointer border-0 bg-transparent transition-colors duration-100',
            value === currentWeek.key ? 'text-accent font-medium' : 'text-foreground hover:bg-muted'
          )}
          onclick={() => select(currentWeek.key)}
        >{currentWeek.label}</button>
      {/if}

      {#if pastWeeks.length > 0}
        <div class="my-1 border-t border-border"></div>
        <div class="max-h-[240px] overflow-y-auto">
          {#each pastWeeks as week (week.key)}
            <button
              data-week-row
              data-week-key={week.key}
              class={cn(
                'w-full text-left px-2 py-[6px] rounded-[var(--radius-sm)] text-xs font-sans cursor-pointer border-0 bg-transparent transition-colors duration-100',
                value === week.key ? 'text-accent font-medium' : 'text-foreground hover:bg-muted'
              )}
              onclick={() => select(week.key)}
            >{week.label}</button>
          {/each}
        </div>
      {/if}
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>
