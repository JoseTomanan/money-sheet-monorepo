<script lang="ts">
  import type { CategoryMap, Entry, AddEntryPayload, UpdateEntryPatch, Direction } from "../lib/types";
  import Modal from "./Modal.svelte";

  interface Props {
    open: boolean;
    categories: CategoryMap;
    entry?: Entry | null;
    onclose: () => void;
    onsave: (payload: AddEntryPayload | { id: number; patch: UpdateEntryPatch }) => void;
  }

  let { open, categories, entry = null, onclose, onsave }: Props = $props();

  const today = new Date().toISOString().slice(0, 10);

  let date = $state(today);
  let direction = $state<Direction>("O");
  let tag = $state("");
  let description = $state("");
  let amount = $state(0);

  $effect(() => {
    if (open) {
      date = entry?.date ?? today;
      direction = entry?.direction ?? "O";
      tag = entry?.tag ?? "";
      description = entry?.description ?? "";
      amount = entry?.amount ?? 0;
    }
  });

  // Reset tag when direction changes so user picks a valid option
  $effect(() => {
    direction; // track
    tag = "";
  });

  const categoryNames = $derived(Object.keys(categories).sort());

  // Incoming → Category list; Outgoing → Subcategory list grouped by Category
  const tagOptions = $derived(
    direction === "I"
      ? categoryNames.map((c) => ({ group: null, value: c, label: c }))
      : categoryNames.flatMap((cat) =>
          (categories[cat] ?? []).map((sub) => ({ group: cat, value: sub, label: sub }))
        )
  );

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    const payload: AddEntryPayload = { date, tag, description, direction, amount };
    if (entry) {
      onsave({ id: entry.id, patch: payload });
    } else {
      onsave(payload);
    }
    onclose();
  }
</script>

<Modal {open} {onclose}>
  <h2 class="text-lg font-semibold mb-4">{entry ? "Edit Entry" : "New Entry"}</h2>
  <form onsubmit={handleSubmit} class="flex flex-col gap-4">
    <div class="flex gap-2">
      <button
        type="button"
        class="flex-1 py-2 rounded-lg font-medium transition-colors
          {direction === 'I' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
        onclick={() => (direction = "I")}
      >
        Incoming
      </button>
      <button
        type="button"
        class="flex-1 py-2 rounded-lg font-medium transition-colors
          {direction === 'O' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
        onclick={() => (direction = "O")}
      >
        Outgoing
      </button>
    </div>

    <div>
      <label for="entry-date" class="block text-sm font-medium text-gray-700 mb-1">Date</label>
      <input
        id="entry-date"
        type="date"
        bind:value={date}
        required
        class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>

    <div>
      <label for="entry-tag" class="block text-sm font-medium text-gray-700 mb-1">
        {direction === "I" ? "Category" : "Subcategory"}
      </label>
      <select
        id="entry-tag"
        bind:value={tag}
        required
        class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="" disabled>Select...</option>
        {#if direction === "I"}
          {#each tagOptions as opt}
            <option value={opt.value}>{opt.label}</option>
          {/each}
        {:else}
          {#each categoryNames as cat}
            <optgroup label={cat}>
              {#each (categories[cat] ?? []) as sub}
                <option value={sub}>{sub}</option>
              {/each}
            </optgroup>
          {/each}
        {/if}
      </select>
    </div>

    <div>
      <label for="entry-desc" class="block text-sm font-medium text-gray-700 mb-1">Description</label>
      <input
        id="entry-desc"
        type="text"
        bind:value={description}
        class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Optional"
      />
    </div>

    <div>
      <label for="entry-amount" class="block text-sm font-medium text-gray-700 mb-1">Amount</label>
      <input
        id="entry-amount"
        type="number"
        bind:value={amount}
        min="0"
        step="0.01"
        required
        class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>

    <div class="flex gap-2 justify-end pt-2">
      <button
        type="button"
        onclick={onclose}
        class="px-4 py-2 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700"
      >
        Cancel
      </button>
      <button
        type="submit"
        class="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium"
      >
        {entry ? "Save" : "Add"}
      </button>
    </div>
  </form>
</Modal>
