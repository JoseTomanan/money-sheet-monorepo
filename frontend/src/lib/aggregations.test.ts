import { describe, it, expect } from 'vitest';
import {
  totalOutgoing,
  totalIncoming,
  outgoingByMonth,
  incomingByMonth,
  outgoingByCategory,
  countByCategory,
  flowByMonth,
  cumulativeOutgoingByDay,
  upToDay,
  paceDelta,
  rankCategorySpend,
  latestEntryDate,
} from './aggregations';
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

describe('totalOutgoing', () => {
  it('sums all outgoing entries', () => {
    expect(totalOutgoing(ENTRIES)).toBe(1100); // 100+200+300+500
  });

  it('returns 0 for empty array', () => {
    expect(totalOutgoing([])).toBe(0);
  });

  it('returns 0 when all entries are incoming', () => {
    const inOnly = ENTRIES.filter(e => e.direction === 'I');
    expect(totalOutgoing(inOnly)).toBe(0);
  });
});

describe('totalIncoming', () => {
  it('sums all incoming entries', () => {
    expect(totalIncoming(ENTRIES)).toBe(1400); // 1000+400
  });

  it('returns 0 for empty array', () => {
    expect(totalIncoming([])).toBe(0);
  });
});

describe('outgoingByMonth', () => {
  it('sums outgoing entries matching the given YYYY-MM', () => {
    expect(outgoingByMonth(ENTRIES, '2026-05')).toBe(600); // 100+200+300
  });

  it('returns 0 when no outgoing entries match the month', () => {
    expect(outgoingByMonth(ENTRIES, '2025-01')).toBe(0);
  });

  it('excludes incoming entries even if in the same month', () => {
    expect(outgoingByMonth(ENTRIES, '2026-05')).not.toBeGreaterThan(600);
  });

  it('returns 0 for empty array', () => {
    expect(outgoingByMonth([], '2026-05')).toBe(0);
  });
});

describe('incomingByMonth', () => {
  it('sums incoming entries matching the given YYYY-MM', () => {
    expect(incomingByMonth(ENTRIES, '2026-05')).toBe(1400); // 1000+400
  });

  it('returns 0 when no incoming entries match the month', () => {
    expect(incomingByMonth(ENTRIES, '2025-01')).toBe(0);
  });

  it('excludes outgoing entries even if in the same month', () => {
    expect(incomingByMonth(ENTRIES, '2026-05')).toBe(1400);
  });

  it('returns 0 for empty array', () => {
    expect(incomingByMonth([], '2026-05')).toBe(0);
  });
});

describe('outgoingByCategory', () => {
  it('groups outgoing amounts by mainCategory', () => {
    const result = outgoingByCategory(ENTRIES);
    expect(result['FOOD']).toBe(300);    // 100+200
    expect(result['TRANSIT']).toBe(300);
    expect(result['HOUSING']).toBe(500);
  });

  it('does not include incoming entries', () => {
    const result = outgoingByCategory(ENTRIES);
    // Incoming entries have mainCategory FOOD and TRANSIT; their amounts must not be added
    expect(result['FOOD']).toBe(300);
    expect(result['TRANSIT']).toBe(300);
  });

  it('returns empty object for empty array', () => {
    expect(outgoingByCategory([])).toEqual({});
  });
});

describe('outgoingByCategory with month filter', () => {
  it('only counts outgoing entries in the given month', () => {
    const result = outgoingByCategory(ENTRIES, '2026-05');
    expect(result['FOOD']).toBe(300);
    expect(result['TRANSIT']).toBe(300);
    expect(result['HOUSING']).toBeUndefined(); // April entry excluded
  });

  it('returns empty object when no entries match the month', () => {
    expect(outgoingByCategory(ENTRIES, '2025-01')).toEqual({});
  });
});

describe('flowByMonth', () => {
  it('returns one row per month, oldest first, ending at endYm', () => {
    const result = flowByMonth(ENTRIES, '2026-05', 3);
    expect(result.map(r => r.ym)).toEqual(['2026-03', '2026-04', '2026-05']);
  });

  it('computes incoming and outgoing per month', () => {
    const result = flowByMonth(ENTRIES, '2026-05', 2);
    expect(result[0]).toEqual({ ym: '2026-04', incoming: 0, outgoing: 500 });
    expect(result[1]).toEqual({ ym: '2026-05', incoming: 1400, outgoing: 600 });
  });

  it('spans year boundaries', () => {
    const result = flowByMonth([], '2026-01', 3);
    expect(result.map(r => r.ym)).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('returns zero rows for empty entries', () => {
    const result = flowByMonth([], '2026-05', 2);
    expect(result.every(r => r.incoming === 0 && r.outgoing === 0)).toBe(true);
  });
});

describe('cumulativeOutgoingByDay', () => {
  it('returns one slot per day of the month', () => {
    expect(cumulativeOutgoingByDay(ENTRIES, '2026-05')).toHaveLength(31);
    expect(cumulativeOutgoingByDay(ENTRIES, '2026-04')).toHaveLength(30);
  });

  it('accumulates outgoing spend day by day', () => {
    const result = cumulativeOutgoingByDay(ENTRIES, '2026-05');
    expect(result[0]).toBe(100);  // May 1
    expect(result[1]).toBe(300);  // +200 on May 2
    expect(result[2]).toBe(600);  // +300 on May 3
    expect(result[30]).toBe(600); // flat for the rest of the month
  });

  it('ignores incoming entries and other months', () => {
    const result = cumulativeOutgoingByDay(ENTRIES, '2026-05');
    expect(result[10]).toBe(600); // May 10/11 incoming entries not added
    const april = cumulativeOutgoingByDay(ENTRIES, '2026-04');
    expect(april[29]).toBe(500); // only the rent entry
  });

  it('returns all zeros for a month with no outgoing', () => {
    const result = cumulativeOutgoingByDay(ENTRIES, '2025-12');
    expect(result.every(v => v === 0)).toBe(true);
  });
});

describe('upToDay', () => {
  it('first day of the current month clamps to 1', () => {
    expect(upToDay(31, true, 1)).toBe(1);
  });

  it('clamps to the current day when browsing the current month', () => {
    expect(upToDay(31, true, 15)).toBe(15);
  });

  it('clamps to month length when the current day exceeds it (should not happen, but safe)', () => {
    expect(upToDay(30, true, 31)).toBe(30);
  });

  it('returns the full month length for a non-current month, ignoring currentDay', () => {
    expect(upToDay(31, false, 5)).toBe(31);
  });
});

describe('paceDelta', () => {
  it('returns null when the previous month had zero spend (division guard)', () => {
    const cur = [100, 200, 300];
    const prev = [0, 0, 0];
    expect(paceDelta(cur, prev, 3)).toBeNull();
  });

  it('previous month shorter than current day: compares against the previous month\'s last available day', () => {
    // Previous month only has 2 days of data; upToDay is 5 — clamp comparison day to prev.length
    const cur = [10, 20, 30, 40, 50];
    const prev = [100, 200];
    // cmpDay = min(5, 2) = 2 → prevAt = prev[1] = 200, curAt = cur[4] = 50
    expect(paceDelta(cur, prev, 5)).toBe(((50 - 200) / 200) * 100);
  });

  it('positive delta when spending faster than the previous month', () => {
    const cur = [300];
    const prev = [100];
    expect(paceDelta(cur, prev, 1)).toBe(200);
  });

  it('negative delta when spending slower than the previous month', () => {
    const cur = [50];
    const prev = [100];
    expect(paceDelta(cur, prev, 1)).toBe(-50);
  });
});

describe('rankCategorySpend', () => {
  it('ranks categories by spend, descending', () => {
    const result = rankCategorySpend(
      ['FOOD', 'TRANSIT', 'HOUSING'],
      { FOOD: 500, TRANSIT: 300, HOUSING: 1000 },
      { FOOD: 300, TRANSIT: 300, HOUSING: 500 },
      800
    );
    expect(result.map(r => r.key)).toEqual(['HOUSING', 'FOOD', 'TRANSIT']);
  });

  it('preserves input order for tied spend amounts (stable sort)', () => {
    const result = rankCategorySpend(
      ['TRANSIT', 'FOOD', 'HOUSING'],
      {},
      { TRANSIT: 100, FOOD: 100, HOUSING: 100 },
      300
    );
    expect(result.map(r => r.key)).toEqual(['TRANSIT', 'FOOD', 'HOUSING']);
  });

  it('defaults missing budget/spend to 0', () => {
    const result = rankCategorySpend(['FOOD'], {}, {}, 0);
    expect(result[0]).toEqual({ key: 'FOOD', budget: 0, spent: 0, pct: 0 });
  });

  it('computes pct of total outgoing per category', () => {
    const result = rankCategorySpend(['FOOD', 'TRANSIT'], {}, { FOOD: 25, TRANSIT: 75 }, 100);
    const food = result.find(r => r.key === 'FOOD')!;
    const transit = result.find(r => r.key === 'TRANSIT')!;
    expect(food.pct).toBe(25);
    expect(transit.pct).toBe(75);
  });

  it('pct is 0 for every category when totalOutgoing is 0 (division guard)', () => {
    const result = rankCategorySpend(['FOOD', 'TRANSIT'], {}, { FOOD: 0, TRANSIT: 0 }, 0);
    expect(result.every(r => r.pct === 0)).toBe(true);
  });
});

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
