<script lang="ts">
  import { onMount } from "svelte";
  import { store } from "./lib/store.svelte";
  import EntriesView from "./routes/EntriesView.svelte";
  import BudgetsView from "./routes/BudgetsView.svelte";

  type Tab = "entries" | "budgets";
  let tab = $state<Tab>("entries");

  onMount(() => {
    store.refreshAll();
  });
</script>

<div class="min-h-screen bg-gray-50">
  <header class="bg-white border-b border-gray-200 sticky top-0 z-10">
    <div class="max-w-5xl mx-auto px-4 flex items-center justify-between h-14">
      <span class="font-semibold text-gray-800">Money Sheet</span>
      <nav class="flex gap-1">
        {#each (["entries", "budgets"] as Tab[]) as t}
          <button
            onclick={() => (tab = t)}
            class="px-3 py-1.5 text-sm rounded-lg font-medium capitalize transition-colors
              {tab === t ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}"
          >
            {t}
          </button>
        {/each}
      </nav>
    </div>
  </header>

  <main class="max-w-5xl mx-auto px-4 py-6">
    {#if store.loading}
      <p class="text-center text-gray-400 py-16">Loading...</p>
    {:else if store.error}
      <div class="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
        {store.error}
      </div>
    {:else if tab === "entries"}
      <EntriesView />
    {:else}
      <BudgetsView />
    {/if}
  </main>
</div>
