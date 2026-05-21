<script lang="ts">
  import { CATEGORIES, CATEGORY_ORDER } from '../lib/theme';
  import { fmtDate, dayOfWeek } from '../lib/format';
  import type { CategoryMap, Entry, AddEntryPayload, UpdateEntryPatch, Direction } from '../lib/types';

  interface Props {
    open: boolean;
    categories: CategoryMap;
    entry?: Entry | null;
    onclose: () => void;
    onsave: (payload: AddEntryPayload | { id: number; patch: UpdateEntryPatch }) => void;
    defaultDirection?: Direction;
  }

  let { open, categories, entry = null, onclose, onsave, defaultDirection = 'O' }: Props = $props();

  const today = new Date().toISOString().slice(0, 10);

  let date       = $state(today);
  let direction  = $state<Direction>('O');
  let tag        = $state('');
  let description = $state('');
  let amount     = $state('');
  let animOpen   = $state(false);
  let animTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (open) {
      date        = entry?.date ?? today;
      direction   = entry?.direction ?? defaultDirection;
      tag         = entry?.tag ?? '';
      description = entry?.description ?? '';
      amount      = entry != null ? String(entry.amount) : '';
      animTimer = setTimeout(() => { animOpen = true; }, 10);
    } else {
      animOpen = false;
      if (animTimer) { clearTimeout(animTimer); animTimer = null; }
    }
  });

  // Reset tag when direction changes so the user picks a valid option
  let prevDirection = $state<Direction>('O');
  $effect(() => {
    if (direction !== prevDirection) {
      prevDirection = direction;
      tag = '';
    }
  });

  const categoryNames = $derived(Object.keys(categories).sort());

  // Flat list of { value, parentCat } tag options for the pill picker
  const tagOptions = $derived(
    direction === 'I'
      ? categoryNames.map((c) => ({ value: c, parentCat: c }))
      : categoryNames.flatMap((cat) =>
          (categories[cat] ?? []).map((sub) => ({ value: sub, parentCat: cat }))
        )
  );

  function handleBackdrop() {
    onclose();
  }

  function handleSave() {
    const amt = parseFloat(amount) || 0;
    const payload: AddEntryPayload = { date, tag, description, direction, amount: amt };
    if (entry) {
      onsave({ id: entry.id, patch: payload });
    } else {
      onsave(payload);
    }
    onclose();
  }

  const title = $derived((entry ? 'Edit' : 'New') + (direction === 'I' ? ' Incoming' : ' Outgoing'));
</script>

{#if open}
  <div class="sheet-root">
    <!-- backdrop -->
    <div
      class="backdrop"
      class:visible={animOpen}
      role="button"
      tabindex="-1"
      aria-label="Close"
      onclick={handleBackdrop}
      onkeydown={(e) => e.key === 'Escape' && handleBackdrop()}
    ></div>

    <!-- sheet -->
    <div class="sheet" class:open={animOpen}>
      <!-- handle -->
      <div class="handle-row">
        <div class="handle"></div>
      </div>

      <!-- header -->
      <div class="sheet-header">
        <button class="header-btn cancel" onclick={onclose}>Cancel</button>
        <span class="sheet-title">{title}</span>
        <button class="header-btn save" onclick={handleSave} disabled={!tag || !amount}>Save</button>
      </div>

      <!-- direction toggle -->
      <div class="direction-row">
        <button
          class="dir-btn"
          class:active-out={direction === 'O'}
          onclick={() => (direction = 'O')}
        >Outgoing</button>
        <button
          class="dir-btn"
          class:active-in={direction === 'I'}
          onclick={() => (direction = 'I')}
        >Incoming</button>
      </div>

      <!-- amount input -->
      <div class="amount-card">
        <div class="amount-label">{direction === 'I' ? 'Amount received' : 'Amount spent'}</div>
        <div class="amount-row">
          <span class="peso-prefix">₱</span>
          <input
            type="text"
            inputmode="decimal"
            class="amount-input"
            bind:value={amount}
            oninput={(e) => {
              amount = (e.target as HTMLInputElement).value.replace(/[^0-9.]/g, '');
            }}
            placeholder="0.00"
          />
        </div>
      </div>

      <!-- description -->
      <div class="field-card">
        <div class="field-label">Description</div>
        <input
          type="text"
          class="field-input"
          bind:value={description}
          placeholder={direction === 'I' ? 'e.g. weekly allowance' : 'e.g. lunch at canteen'}
        />
      </div>

      <!-- date -->
      <div class="field-card">
        <div class="field-label">Date</div>
        <div class="date-row">
          <span class="date-display">{fmtDate(date)} · {dayOfWeek(date)}</span>
          <input type="date" class="date-input" bind:value={date} />
        </div>
      </div>

      <!-- tag picker -->
      <div class="tag-section-label">{direction === 'I' ? 'Category' : 'Subcategory'}</div>
      <div class="tag-scroller">
        {#each tagOptions as opt}
          {@const catStyle = CATEGORIES[opt.parentCat] ?? { color: 'var(--muted-foreground)', soft: 'var(--muted)' }}
          <button
            class="tag-pill"
            class:tag-active={tag === opt.value}
            style="
              background: {tag === opt.value ? catStyle.color : catStyle.soft};
              color: {tag === opt.value ? '#fff' : catStyle.color};
            "
            onclick={() => (tag = opt.value)}
          >
            <span class="tag-dot" style="background: {tag === opt.value ? '#fff' : catStyle.color}"></span>
            {opt.value}
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .sheet-root {
    position: fixed;
    inset: 0;
    z-index: 200;
  }

  .backdrop {
    position: absolute;
    inset: 0;
    background: rgba(26, 24, 20, 0.4);
    opacity: 0;
    transition: opacity 280ms cubic-bezier(.2,.7,.2,1);
  }
  .backdrop.visible { opacity: 1; }

  .sheet {
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%) translateY(100%);
    width: 100%;
    max-width: var(--app-max-width);
    background: var(--background);
    border-top-left-radius: 28px;
    border-top-right-radius: 28px;
    box-shadow: var(--shadow-sheet);
    padding-bottom: 32px;
    transition: transform 320ms cubic-bezier(.2,.7,.2,1);
    max-height: 90dvh;
    overflow-y: auto;
  }
  .sheet.open { transform: translateX(-50%) translateY(0); }

  .handle-row {
    display: flex;
    justify-content: center;
    padding: 10px 0 6px;
  }
  .handle {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--border);
  }

  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 20px 6px;
  }
  .header-btn {
    background: none;
    border: 0;
    cursor: pointer;
    font-family: var(--font-sans);
    font-size: 15px;
    padding: 0;
  }
  .cancel { color: var(--muted-foreground); }
  .save {
    color: var(--accent);
    font-weight: 600;
  }
  .save:disabled { opacity: 0.4; cursor: not-allowed; }
  .sheet-title {
    font-family: var(--font-display);
    font-size: 16px;
    font-weight: 600;
    color: var(--foreground);
    letter-spacing: -0.2px;
  }

  .direction-row {
    display: flex;
    gap: 8px;
    padding: 10px 16px 4px;
  }
  .dir-btn {
    flex: 1;
    padding: 10px 0;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--muted);
    color: var(--muted-foreground);
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 150ms, color 150ms;
  }
  .active-out {
    background: rgba(193, 74, 50, 0.12);
    color: #c14a32;
    border-color: rgba(193, 74, 50, 0.25);
  }
  .active-in {
    background: rgba(47, 138, 85, 0.12);
    color: #2f8a55;
    border-color: rgba(47, 138, 85, 0.25);
  }

  .amount-card {
    margin: 10px 16px 0;
    padding: 20px 22px;
    border-radius: var(--radius-lg);
    background: var(--card);
    box-shadow: var(--shadow-card);
    text-align: center;
  }
  .amount-label {
    font-size: 10px;
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--muted-foreground);
    margin-bottom: 8px;
  }
  .amount-row {
    display: flex;
    justify-content: center;
    align-items: baseline;
    gap: 4px;
  }
  .peso-prefix {
    font-family: var(--font-mono);
    font-size: 32px;
    font-weight: 500;
    color: var(--muted-foreground);
    letter-spacing: -0.5px;
  }
  .amount-input {
    width: 200px;
    background: transparent;
    border: 0;
    outline: none;
    font-family: var(--font-mono);
    font-size: 44px;
    font-weight: 500;
    color: var(--foreground);
    letter-spacing: -1.2px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .amount-input::placeholder { color: var(--muted-foreground); }

  .field-card {
    margin: 10px 16px 0;
    padding: 12px 18px;
    border-radius: var(--radius-md);
    background: var(--card);
    box-shadow: var(--shadow-card);
  }
  .field-label {
    font-size: 10px;
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--muted-foreground);
    margin-bottom: 4px;
  }
  .field-input {
    width: 100%;
    background: transparent;
    border: 0;
    outline: none;
    font-family: var(--font-sans);
    font-size: 15px;
    color: var(--foreground);
  }
  .field-input::placeholder { color: var(--muted-foreground); }

  .date-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .date-display {
    font-family: var(--font-mono);
    font-size: 15px;
    color: var(--foreground);
    font-variant-numeric: tabular-nums;
  }
  .date-input {
    font-size: 13px;
    color: var(--accent);
    font-family: var(--font-sans);
    border: 0;
    background: transparent;
    cursor: pointer;
    outline: none;
    text-align: right;
    min-width: 0;
  }

  .tag-section-label {
    padding: 14px 20px 6px;
    font-size: 10px;
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: var(--muted-foreground);
  }
  .tag-scroller {
    display: flex;
    gap: 8px;
    padding: 4px 16px 4px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  @media (min-width: 768px) {
    .tag-scroller {
      flex-wrap: wrap;
      overflow-x: unset;
    }
  }
  .tag-pill {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: var(--radius-pill);
    border: 0;
    font-family: var(--font-sans);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 150ms, color 150ms;
    white-space: nowrap;
  }
  .tag-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
</style>
