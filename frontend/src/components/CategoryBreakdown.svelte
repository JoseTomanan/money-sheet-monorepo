<script lang="ts">
  import type { SubcategoryBreakdown, CategoryMap } from "../lib/types";

  interface Props {
    category: string;
    categories: CategoryMap;
    breakdown: SubcategoryBreakdown;
  }

  let { category, categories, breakdown }: Props = $props();

  const subcategories = $derived(categories[category] ?? []);
  const rows = $derived(
    subcategories
      .map((sub) => ({ subcategory: sub, amount: breakdown[sub] ?? 0 }))
      .filter((r) => r.amount > 0)
      .sort((a, b) => b.amount - a.amount)
  );
  const total = $derived(rows.reduce((s, r) => s + r.amount, 0));

  function fmt(n: number) {
    return n.toLocaleString("en-PH", { style: "currency", currency: "PHP" });
  }
</script>

{#if rows.length === 0}
  <p class="text-sm text-gray-400 px-4 py-2">No outgoing entries for {category}.</p>
{:else}
  <ul class="divide-y divide-gray-100">
    {#each rows as row}
      <li class="flex justify-between items-center px-4 py-2 text-sm">
        <span class="text-gray-700">{row.subcategory}</span>
        <span class="font-medium text-red-600">{fmt(row.amount)}</span>
      </li>
    {/each}
    <li class="flex justify-between items-center px-4 py-2 text-sm font-semibold border-t border-gray-200">
      <span class="text-gray-500">Total spent</span>
      <span class="text-red-700">{fmt(total)}</span>
    </li>
  </ul>
{/if}
