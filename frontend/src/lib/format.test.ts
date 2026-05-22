import { describe, it, expect } from 'vitest';
import { normalizeDate } from './format';

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
