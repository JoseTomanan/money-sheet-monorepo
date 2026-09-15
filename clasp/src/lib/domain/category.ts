/** The fixed top-level budget Categories, in spreadsheet/display order. */
export const CATEGORY_ORDER = [
  "HOUSING",
  "FOOD",
  "TRANSIT",
  "HEALTH",
  "FINANCE",
  "LIFESTYLE",
  "MISC",
] as const;

export type Category = typeof CATEGORY_ORDER[number];

/** Runtime mapping of Category names to their known Subcategories. */
export type CategoryMap = Record<string, string[]>;

export function isCategory(value: string): value is Category {
  return (CATEGORY_ORDER as readonly string[]).includes(value);
}

export function checkTagDirection(
  tag: string,
  direction: "I" | "O",
  categories: CategoryMap,
): string | null {
  const categoryNames = new Set(Object.keys(categories));

  if (direction === "I") {
    return categoryNames.has(tag)
      ? null
      : `Tag "${tag}" is not a Category. Incoming entries require a Category tag (e.g. FOOD, HOUSING).`;
  }

  const isSubcategory = Object.values(categories).some((subcategories) =>
    subcategories.includes(tag)
  );
  return isSubcategory || categoryNames.has(tag)
    ? null
    : `Tag "${tag}" is not a Subcategory or Category. Outgoing entries require a Subcategory (e.g. Dining, Rent) or a Category (e.g. FOOD).`;
}
