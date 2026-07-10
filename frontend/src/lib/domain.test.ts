import { describe, it, expect } from 'vitest';
import { getMainCategory, isValidTag } from './domain';
import type { CategoryMap } from './types';

const MAP: CategoryMap = {
  FOOD:    ['Groceries', 'Dining'],
  TRANSIT: ['Commute Fare', 'Fuel'],
};

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

  it('Outgoing: true for a category key (Subcategory is optional, #123)', () => {
    expect(isValidTag('FOOD', 'O', MAP)).toBe(true);
  });

  it('Outgoing: false for unknown string', () => {
    expect(isValidTag('Unicorn', 'O', MAP)).toBe(false);
  });

  it('empty CategoryMap: always false', () => {
    expect(isValidTag('FOOD', 'I', {})).toBe(false);
    expect(isValidTag('Groceries', 'O', {})).toBe(false);
  });
});
