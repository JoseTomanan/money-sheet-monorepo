import { describe, it, expect } from 'vitest';
import { normalizeDate, peso, shiftYearMonth, daysInYearMonth, monthLabel, monthShort } from './format';

describe('shiftYearMonth', () => {
  it('shifts forward within a year', () => {
    expect(shiftYearMonth('2026-05', 1)).toBe('2026-06');
  });

  it('shifts backward within a year', () => {
    expect(shiftYearMonth('2026-05', -2)).toBe('2026-03');
  });

  it('crosses year boundary going back', () => {
    expect(shiftYearMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftYearMonth('2026-02', -5)).toBe('2025-09');
  });

  it('crosses year boundary going forward', () => {
    expect(shiftYearMonth('2025-12', 1)).toBe('2026-01');
  });

  it('returns same month for zero delta', () => {
    expect(shiftYearMonth('2026-05', 0)).toBe('2026-05');
  });
});

describe('daysInYearMonth', () => {
  it('handles 31- and 30-day months', () => {
    expect(daysInYearMonth('2026-05')).toBe(31);
    expect(daysInYearMonth('2026-04')).toBe(30);
  });

  it('handles February and leap years', () => {
    expect(daysInYearMonth('2026-02')).toBe(28);
    expect(daysInYearMonth('2028-02')).toBe(29);
  });
});

describe('monthLabel / monthShort', () => {
  it('formats a long month label', () => {
    expect(monthLabel('2026-06')).toBe('June 2026');
  });

  it('formats a short month name', () => {
    expect(monthShort('2026-06')).toBe('Jun');
  });
});

describe('normalizeDate', () => {
  it('passes through YYYY-MM-DD unchanged', () => {
    expect(normalizeDate('2026-05-21')).toBe('2026-05-21');
  });

  it('strips time component from ISO datetime string', () => {
    expect(normalizeDate('2026-05-21T00:00:00.000Z')).toBe('2026-05-21');
  });

  it('converts M/D/YYYY locale format to YYYY-MM-DD', () => {
    expect(normalizeDate('5/21/2026')).toBe('2026-05-21');
  });

  it('converts MM/DD/YYYY locale format to YYYY-MM-DD', () => {
    expect(normalizeDate('05/21/2026')).toBe('2026-05-21');
  });

  it('pads single-digit month and day', () => {
    expect(normalizeDate('1/3/2026')).toBe('2026-01-03');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeDate('')).toBe('');
  });

  it('returns empty string for unrecognized format', () => {
    expect(normalizeDate('undefined')).toBe('');
  });

  it('parses full Date.toString() format returned by GAS (Manila timezone)', () => {
    expect(normalizeDate('Mon May 18 2026 00:00:00 GMT+0800 (Standard na Oras sa Pilipinas)')).toBe('2026-05-18');
  });

  it('parses Date.toString() format at start of month boundary', () => {
    expect(normalizeDate('Fri May 01 2026 00:00:00 GMT+0800 (Standard na Oras sa Pilipinas)')).toBe('2026-05-01');
  });
});

describe('peso', () => {
  it('formats a positive number with the default ₱ symbol', () => {
    expect(peso(1200)).toBe('₱1,200.00');
  });

  it('formats a negative number with leading minus before the symbol', () => {
    expect(peso(-50.5)).toBe('-₱50.50');
  });

  it('formats zero as ₱0.00', () => {
    expect(peso(0)).toBe('₱0.00');
  });

  it('accepts a custom currency symbol', () => {
    expect(peso(1200, '$')).toBe('$1,200.00');
  });

  it('applies the custom symbol to negative numbers too', () => {
    expect(peso(-50.5, '€')).toBe('-€50.50');
  });

  it('falls back to ₱ when symbol is not provided', () => {
    expect(peso(500)).toBe('₱500.00');
  });
});
