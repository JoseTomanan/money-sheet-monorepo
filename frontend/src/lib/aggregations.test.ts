import { describe, it, expect } from 'vitest';
import { countByCategory, latestEntryDate } from './aggregations';
import type { Entry } from './types';

// Small fixture for isolated assertions
const ENTRIES: Entry[] = [
  { id: 1, date: '2026-05-01', tag: 'Groceries',   mainCategory: 'FOOD',    description: '', direction: 'O', amount: 100 },
  { id: 2, date: '2026-05-02', tag: 'Dining',       mainCategory: 'FOOD',    description: '', direction: 'O', amount: 200 },
  { id: 3, date: '2026-05-03', tag: 'Fuel',         mainCategory: 'TRANSIT', description: '', direction: 'O', amount: 300 },
  { id: 4, date: '2026-04-15', tag: 'Rent',         mainCategory: 'HOUSING', description: '', direction: 'O', amount: 500 },
  { id: 5, date: '2026-05-10', tag: 'FOOD',         mainCategory: 'FOOD',    description: '', direction: 'I', amount: 1000 },
  { id: 6, date: '2026-05-11', tag: 'TRANSIT',      mainCategory: 'TRANSIT', description: '', direction: 'I', amount: 400 },
];

describe('latestEntryDate', () => {
  it('returns null for an empty array', () => {
    expect(latestEntryDate([])).toBeNull();
  });

  it('returns the max date regardless of array order', () => {
    expect(latestEntryDate(ENTRIES)).toBe('2026-05-11');
  });

  it('a single entry is its own latest date', () => {
    expect(latestEntryDate([ENTRIES[3]])).toBe('2026-04-15');
  });
});

describe('countByCategory', () => {
  it('counts all entries by mainCategory when direction is omitted', () => {
    const result = countByCategory(ENTRIES);
    expect(result['FOOD']).toBe(3);    // ids 1,2,5
    expect(result['TRANSIT']).toBe(2); // ids 3,6
    expect(result['HOUSING']).toBe(1); // id 4
  });

  it('counts only outgoing when direction is O', () => {
    const result = countByCategory(ENTRIES, 'O');
    expect(result['FOOD']).toBe(2);    // ids 1,2
    expect(result['TRANSIT']).toBe(1); // id 3
    expect(result['HOUSING']).toBe(1); // id 4
  });

  it('counts only incoming when direction is I', () => {
    const result = countByCategory(ENTRIES, 'I');
    expect(result['FOOD']).toBe(1);    // id 5
    expect(result['TRANSIT']).toBe(1); // id 6
    expect(result['HOUSING']).toBeUndefined();
  });

  it('returns empty object for empty array', () => {
    expect(countByCategory([])).toEqual({});
  });
});
