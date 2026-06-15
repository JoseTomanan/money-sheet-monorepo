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
