/**
 * The fixed top-level budget Categories, in their spreadsheet/display order.
 *
 * This is deliberately independent of the Categories sheet: that sheet owns
 * Subcategory-to-Category mappings, not the closed seven-Category domain.
 */
export const CATEGORY_ORDER = ["HOUSING", "FOOD", "TRANSIT", "HEALTH", "FINANCE", "LIFESTYLE", "MISC"] as const;

export type Category = typeof CATEGORY_ORDER[number];

export function isCategory(value: string): value is Category {
  return (CATEGORY_ORDER as readonly string[]).includes(value);
}
