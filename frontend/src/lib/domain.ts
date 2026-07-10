import type { Direction, CategoryMap, Entry, AddEntryPayload } from './types';

export function getMainCategory(tag: string, categories: CategoryMap): string {
  for (const [cat, subs] of Object.entries(categories)) {
    if (subs.includes(tag)) return cat;
  }
  return tag;
}

export function buildEntry(id: number, payload: AddEntryPayload, categories: CategoryMap): Entry {
  return { id, mainCategory: getMainCategory(payload.tag, categories), ...payload };
}

export function isValidTag(
  tag: string,
  direction: Direction,
  categories: CategoryMap
): boolean {
  if (direction === 'I') return Object.keys(categories).includes(tag);
  // Outgoing: a Subcategory is valid, and so is its bare parent Category —
  // Subcategory is optional on Outgoing (#123).
  return Object.values(categories).flat().includes(tag)
    || Object.keys(categories).includes(tag);
}
