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
  return Object.values(categories).flat().includes(tag);
}
