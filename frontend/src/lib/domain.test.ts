import { describe, it, expect } from 'vitest';
import { getTagOptions, getMainCategory, isValidTag } from './domain';
import type { CategoryMap } from './types';

const MAP: CategoryMap = {
  FOOD:    ['Groceries', 'Dining'],
  TRANSIT: ['Commute Fare', 'Fuel'],
};

describe('getTagOptions', () => {
  it('Incoming → returns every category as both value and parentCat, sorted', () => {
    const opts = getTagOptions('I', MAP);
    expect(opts).toEqual([
      { value: 'FOOD', parentCat: 'FOOD' },
      { value: 'TRANSIT', parentCat: 'TRANSIT' },
    ]);
  });

  it('Outgoing → returns flattened subcategories with their parent Category', () => {
    const opts = getTagOptions('O', MAP);
    expect(opts).toEqual([
      { value: 'Groceries', parentCat: 'FOOD' },
      { value: 'Dining',    parentCat: 'FOOD' },
      { value: 'Commute Fare', parentCat: 'TRANSIT' },
      { value: 'Fuel',      parentCat: 'TRANSIT' },
    ]);
  });

  it('empty CategoryMap returns empty array for both directions', () => {
    expect(getTagOptions('I', {})).toEqual([]);
    expect(getTagOptions('O', {})).toEqual([]);
  });
});

describe('getMainCategory', () => {
  it('resolves a known subcategory to its parent category', () => {
    expect(getMainCategory('Groceries', MAP)).toBe('FOOD');
    expect(getMainCategory('Fuel', MAP)).toBe('TRANSIT');
  });

  it('passes through a Category tag unchanged', () => {
    expect(getMainCategory('FOOD', MAP)).toBe('FOOD');
  });

  it('passes through an unknown tag unchanged', () => {
    expect(getMainCategory('Unicorn', MAP)).toBe('Unicorn');
  });

  it('returns the tag unchanged for an empty CategoryMap', () => {
    expect(getMainCategory('Anything', {})).toBe('Anything');
  });
});

describe('isValidTag', () => {
  it('Incoming: true for a known category key', () => {
    expect(isValidTag('FOOD', 'I', MAP)).toBe(true);
  });

  it('Incoming: false for a subcategory value', () => {
    expect(isValidTag('Groceries', 'I', MAP)).toBe(false);
  });

  it('Incoming: false for unknown string', () => {
    expect(isValidTag('Unicorn', 'I', MAP)).toBe(false);
  });

  it('Outgoing: true for a known subcategory', () => {
    expect(isValidTag('Dining', 'O', MAP)).toBe(true);
  });

  it('Outgoing: false for a category key', () => {
    expect(isValidTag('FOOD', 'O', MAP)).toBe(false);
  });

  it('Outgoing: false for unknown string', () => {
    expect(isValidTag('Unicorn', 'O', MAP)).toBe(false);
  });

  it('empty CategoryMap: always false', () => {
    expect(isValidTag('FOOD', 'I', {})).toBe(false);
    expect(isValidTag('Groceries', 'O', {})).toBe(false);
  });
});
