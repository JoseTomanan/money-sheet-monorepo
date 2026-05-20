<script lang="ts">
  import type { Direction } from "../lib/types";

  interface Props {
    tag: string;
    direction: Direction;
    mainCategory: string;
  }

  let { tag, direction, mainCategory }: Props = $props();

  // Vivid palette for Incoming (tag = Category name)
  const VIVID: Record<string, { bg: string; text: string }> = {
    HOUSING:   { bg: "#1d4ed8", text: "#ffffff" }, // blue-700
    FOOD:      { bg: "#15803d", text: "#ffffff" }, // green-700
    TRANSIT:   { bg: "#b91c1c", text: "#ffffff" }, // red-700
    HEALTH:    { bg: "#7c2d12", text: "#ffffff" }, // brown/orange-900
    FINANCE:   { bg: "#713f12", text: "#ffffff" }, // olive/yellow-900
    LIFESTYLE: { bg: "#1f2937", text: "#ffffff" }, // gray-800 near-black
    MISC:      { bg: "#6b7280", text: "#ffffff" }, // gray-500
  };

  // Pastel palette for Outgoing (tag = Subcategory, keyed by parent Category)
  const PASTEL: Record<string, { bg: string; text: string }> = {
    HOUSING:   { bg: "#dbeafe", text: "#1e40af" }, // blue-100 / blue-800
    FOOD:      { bg: "#dcfce7", text: "#166534" }, // green-100 / green-800
    TRANSIT:   { bg: "#fee2e2", text: "#991b1b" }, // red-100 / red-800
    HEALTH:    { bg: "#ffedd5", text: "#7c2d12" }, // orange-100 / orange-900
    FINANCE:   { bg: "#fef9c3", text: "#713f12" }, // yellow-100 / yellow-900
    LIFESTYLE: { bg: "#f3e8ff", text: "#6b21a8" }, // purple-100 / purple-800
    MISC:      { bg: "#f3f4f6", text: "#374151" }, // gray-100 / gray-700
  };

  const FALLBACK = { bg: "#e5e7eb", text: "#374151" };

  const style = $derived(
    direction === "I"
      ? (VIVID[tag] ?? FALLBACK)
      : (PASTEL[mainCategory] ?? FALLBACK)
  );
</script>

<span
  style="background-color: {style.bg}; color: {style.text};"
  class="inline-block min-w-[6rem] text-center px-2.5 py-0.5 rounded-full text-xs font-semibold truncate max-w-[10rem]"
>
  {tag}
</span>
