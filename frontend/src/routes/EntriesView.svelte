<script lang="ts">
  import { store } from "../lib/store.svelte";
  import type { Entry, AddEntryPayload, UpdateEntryPatch } from "../lib/types";
  import EntryForm from "../components/EntryForm.svelte";
  import TagPill from "../components/TagPill.svelte";

  let formOpen = $state(false);
  let editTarget = $state<Entry | null>(null);
  let pendingDelete = $state<number | null>(null);
  let filterDir = $state<"all" | "I" | "O">("all");
  let filterCat = $state("");

  const categoryNames = $derived(Object.keys(store.categories).sort());

  const filtered = $derived(
    store.entries
      .filter((e) => {
        if (filterDir !== "all" && e.direction !== filterDir) return false;
        if (filterCat && e.mainCategory !== filterCat) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  );

  function openAdd() {
    editTarget = null;
    formOpen = true;
  }

  function openEdit(e: Entry) {
    editTarget = e;
    formOpen = true;
  }

  async function handleSave(
    payload: AddEntryPayload | { id: number; patch: UpdateEntryPatch }
  ) {
    if ("id" in payload) {
      await store.updateEntry(payload.id, payload.patch);
    } else {
      await store.addEntry(payload);
    }
  }

  async function confirmDelete(id: number) {
    await store.deleteEntry(id);
    pendingDelete = null;
  }

  function fmt(n: number) {
    return n.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
  }
</script>

<div class="space-y-4">
  <!-- Toolbar -->
  <div class="flex flex-wrap gap-3 items-center justify-between">
    <div class="flex gap-2 flex-wrap">
      <select
        bind:value={filterDir}
        class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="all">All directions</option>
        <option value="I">Incoming</option>
        <option value="O">Outgoing</option>
      </select>
      <select
        bind:value={filterCat}
        class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">All categories</option>
        {#each categoryNames as cat}
          <option value={cat}>{cat}</option>
        {/each}
      </select>
    </div>
    <button
      onclick={openAdd}
      class="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium"
    >
      + Add Entry
    </button>
  </div>

  <!-- Table -->
  <div class="overflow-x-auto rounded-xl border border-gray-200">
    <table class="w-full text-sm">
      <thead class="bg-gray-50 text-gray-600 uppercase text-xs">
        <tr>
          <th class="px-3 py-2 text-left">Date</th>
          <th class="px-3 py-2 text-left">Dir</th>
          <th class="px-3 py-2 text-left">Tag</th>
          <th class="px-3 py-2 text-left hidden sm:table-cell">Category</th>
          <th class="px-3 py-2 text-left hidden md:table-cell">Description</th>
          <th class="px-3 py-2 text-right">Amount</th>
          <th class="px-3 py-2"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-100">
        {#each filtered as entry (entry.id)}
          <tr class="hover:bg-gray-50">
            <td class="px-3 py-2 text-gray-600 whitespace-nowrap">{entry.date}</td>
            <td class="px-3 py-2">
              <span
                class="inline-block px-1.5 py-0.5 rounded text-xs font-semibold
                  {entry.direction === 'I' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}"
              >
                {entry.direction === "I" ? "IN" : "OUT"}
              </span>
            </td>
            <td class="px-3 py-2"><TagPill tag={entry.tag} direction={entry.direction} mainCategory={entry.mainCategory} /></td>
            <td class="px-3 py-2 text-gray-500 hidden sm:table-cell">{entry.mainCategory}</td>
            <td class="px-3 py-2 text-gray-500 hidden md:table-cell max-w-xs truncate">{entry.description}</td>
            <td
              class="px-3 py-2 text-right font-medium
                {entry.direction === 'I' ? 'text-green-700' : 'text-red-600'}"
            >
              {entry.direction === "O" ? "−" : "+"}{fmt(entry.amount)}
            </td>
            <td class="px-3 py-2">
              {#if pendingDelete === entry.id}
                <span class="inline-flex gap-1">
                  <button
                    onclick={() => confirmDelete(entry.id)}
                    class="text-xs text-red-600 hover:underline"
                  >Confirm</button>
                  <button
                    onclick={() => (pendingDelete = null)}
                    class="text-xs text-gray-500 hover:underline"
                  >Cancel</button>
                </span>
              {:else}
                <span class="inline-flex gap-2">
                  <button
                    onclick={() => openEdit(entry)}
                    class="text-xs text-blue-600 hover:underline"
                  >Edit</button>
                  <button
                    onclick={() => (pendingDelete = entry.id)}
                    class="text-xs text-red-500 hover:underline"
                  >Delete</button>
                </span>
              {/if}
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="7" class="px-3 py-8 text-center text-gray-400">No entries found.</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<EntryForm
  open={formOpen}
  categories={store.categories}
  entry={editTarget}
  onclose={() => (formOpen = false)}
  onsave={handleSave}
/>
