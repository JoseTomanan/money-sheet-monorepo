<script lang="ts">
  import { store } from "../lib/store.svelte";
  import CategoryBreakdown from "../components/CategoryBreakdown.svelte";

  const CATEGORIES = ["HOUSING", "FOOD", "TRANSIT", "HEALTH", "FINANCE", "LIFESTYLE", "MISC"];

  let expanded = $state<string | null>(null);

  function toggle(cat: string) {
    expanded = expanded === cat ? null : cat;
  }

  function fmt(n: number) {
    return n.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
  }
</script>

<div class="space-y-6">
  <!-- ON HAND card -->
  <div class="rounded-2xl bg-blue-600 text-white p-6 shadow">
    <p class="text-sm font-medium opacity-80 mb-1">On Hand</p>
    <p class="text-4xl font-bold">{fmt(store.master.onHand)}</p>
  </div>

  <!-- Category budget cards -->
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    {#each CATEGORIES as cat}
      {@const budget = store.master.budgets[cat] ?? 0}
      <div class="rounded-xl border border-gray-200 overflow-hidden">
        <button
          class="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 text-left"
          onclick={() => toggle(cat)}
        >
          <div>
            <p class="text-xs text-gray-500 uppercase tracking-wide">{cat}</p>
            <p
              class="text-xl font-semibold {budget >= 0 ? 'text-gray-900' : 'text-red-600'}"
            >
              {fmt(budget)}
            </p>
          </div>
          <span class="text-gray-400 text-lg">{expanded === cat ? "▲" : "▼"}</span>
        </button>
        {#if expanded === cat}
          <div class="border-t border-gray-100 bg-gray-50">
            <CategoryBreakdown
              category={cat}
              categories={store.categories}
              breakdown={store.breakdown}
            />
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>
