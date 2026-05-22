import { describe, it, expect } from 'vitest';
import { CATEGORIES, CATEGORY_ORDER, CATEGORY_MAP } from './theme';

describe('CATEGORIES catalog', () => {
  it('every category has a non-empty subcategories array', () => {
    for (const [key, style] of Object.entries(CATEGORIES)) {
      expect(style.subcategories, `${key}.subcategories`).toBeDefined();
      expect(style.subcategories.length, `${key} subcategory count`).toBeGreaterThan(0);
    }
  });

  it('no subcategory belongs to two parent categories', () => {
    const seen = new Map<string, string>();
    for (const [cat, style] of Object.entries(CATEGORIES)) {
      for (const sub of style.subcategories) {
        expect(seen.has(sub), `"${sub}" appears in both ${seen.get(sub)} and ${cat}`).toBe(false);
        seen.set(sub, cat);
      }
    }
  });

  it('CATEGORY_ORDER covers exactly the keys of CATEGORIES', () => {
    const catKeys = new Set(Object.keys(CATEGORIES));
    const orderKeys = new Set<string>(CATEGORY_ORDER);
    expect(orderKeys).toEqual(catKeys);
  });
});

describe('CATEGORY_MAP', () => {
  it('has the same keys as CATEGORIES', () => {
    expect(Object.keys(CATEGORY_MAP).sort()).toEqual(Object.keys(CATEGORIES).sort());
  });

  it('each value matches the subcategories array from CATEGORIES', () => {
    for (const [key, subs] of Object.entries(CATEGORY_MAP)) {
      expect(subs).toEqual(CATEGORIES[key].subcategories);
    }
  });

  it('includes canonical CONTEXT.md subcategories for each category', () => {
    expect(CATEGORY_MAP['HOUSING']).toContain('Maintenance');
    expect(CATEGORY_MAP['TRANSIT']).toContain('Auto Maintenance');
    expect(CATEGORY_MAP['HEALTH']).toContain('Consultation Fee');
    expect(CATEGORY_MAP['FINANCE']).toContain('Tax');
    expect(CATEGORY_MAP['MISC']).toContain('Uniform');
    expect(CATEGORY_MAP['LIFESTYLE']).not.toContain('Uniform');
  });
});
