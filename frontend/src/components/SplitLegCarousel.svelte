<script lang="ts">
  import { CATEGORIES } from '../lib/theme';
  import type { SplitState, Leg } from '../lib/splitEntry';

  interface Props {
    split: SplitState;
    tagOptions: Array<{ value: string; parentCat: string }>;
    onupdate: (i: number, patch: Partial<Leg>) => void;
    onremove: (i: number) => void;
    onadd: () => void;
  }

  let { split, tagOptions, onupdate, onremove, onadd }: Props = $props();
</script>

<div class="carousel">
  {#each split.legs as leg, i}
    <div class="leg-card">
      <div class="leg-head">
        <span class="leg-label">Leg {i + 1}</span>
        <button
          class="leg-remove"
          disabled={split.legs.length <= 2}
          onclick={() => onremove(i)}
        >Remove</button>
      </div>
      <div class="amount-row">
        <span class="peso">₱</span>
        <input
          type="text"
          inputmode="decimal"
          class="amount-input"
          value={leg.amount}
          oninput={(e) => {
            onupdate(i, { amount: (e.target as HTMLInputElement).value.replace(/[^0-9.]/g, '') });
          }}
          placeholder="0.00"
        />
      </div>
      <div class="tag-grid">
        {#each tagOptions as opt}
          {@const s = CATEGORIES[opt.parentCat] ?? { color: 'var(--muted-foreground)', soft: 'var(--muted)' }}
          <button
            class="tag-pill"
            class:active={leg.tag === opt.value}
            style="background: {leg.tag === opt.value ? s.color : s.soft}; color: {leg.tag === opt.value ? '#fff' : s.color};"
            onclick={() => onupdate(i, { tag: opt.value })}
          >
            <span class="dot" style="background: {leg.tag === opt.value ? '#fff' : s.color}"></span>
            {opt.value}
          </button>
        {/each}
      </div>
    </div>
  {/each}

  <button class="add-card" onclick={onadd}>
    <span class="add-plus">+</span>
    <span class="add-label">Add leg</span>
  </button>
</div>

<style>
  .carousel {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scroll-padding-left: 16px;
    gap: 10px;
    padding: 10px 0;
    scrollbar-width: none;
  }
  .carousel::-webkit-scrollbar { display: none; }

  .leg-card {
    flex-shrink: 0;
    width: 85%;
    scroll-snap-align: start;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 12px 14px;
  }
  .leg-card:first-child { margin-left: 16px; }

  .leg-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  .leg-label {
    font-size: 10px;
    font-family: var(--font-sans);
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--muted-foreground);
  }
  .leg-remove {
    background: none;
    border: 0;
    font-family: var(--font-sans);
    font-size: 12px;
    color: var(--destructive);
    cursor: pointer;
    padding: 0;
  }
  .leg-remove:disabled { opacity: 0.3; cursor: not-allowed; }

  .amount-row {
    display: flex;
    align-items: baseline;
    gap: 3px;
    margin-bottom: 10px;
  }
  .peso {
    font-family: var(--font-mono);
    font-size: 18px;
    font-weight: 500;
    color: var(--muted-foreground);
  }
  .amount-input {
    background: transparent;
    border: 0;
    outline: none;
    font-family: var(--font-mono);
    font-size: 26px;
    font-weight: 500;
    color: var(--foreground);
    letter-spacing: -0.8px;
    width: 100%;
  }
  .amount-input::placeholder { color: var(--muted-foreground); }

  .tag-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }
  .tag-pill {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 10px;
    border-radius: var(--radius-pill);
    border: 0;
    font-family: var(--font-sans);
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: background 150ms, color 150ms;
    white-space: nowrap;
  }
  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .add-card {
    flex-shrink: 0;
    width: calc(85% / 5);
    scroll-snap-align: start;
    margin-right: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1.5px dashed var(--border);
    border-radius: var(--radius-lg);
    background: transparent;
    cursor: pointer;
    min-height: 120px;
  }
  .add-plus {
    font-size: 24px;
    color: var(--accent);
    line-height: 1;
  }
  .add-label {
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 500;
    color: var(--accent);
  }
</style>
