import { describe, it, expect, vi, afterEach } from 'vitest';
import { mockGetStats } from './mock';

describe('mockGetStats — #129 category-change + pace fields', () => {
  it('every categoryMonthChange row satisfies netChange = incoming - outgoing', async () => {
    const stats = await mockGetStats();
    expect(stats.categoryMonthChange.length).toBeGreaterThan(0);
    for (const c of stats.categoryMonthChange) {
      expect(c.netChange).toBeCloseTo(c.incoming - c.outgoing);
    }
  });

  it('categoryMonthChange has exactly one row per category (no duplicates)', async () => {
    const stats = await mockGetStats();
    const names = stats.categoryMonthChange.map((c) => c.category);
    expect(new Set(names).size).toBe(names.length);
  });

  it('spendingPace days are 1..N in order, one per day of the current month', async () => {
    const stats = await mockGetStats();
    const days = stats.spendingPace.map((p) => p.day);
    expect(days[0]).toBe(1);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(days.length).toBeGreaterThanOrEqual(28); // shortest month is February
  });

  it('cumulativeThisMonth never decreases as the day advances (it is a running total)', async () => {
    const stats = await mockGetStats();
    const cum = stats.spendingPace.map((p) => p.cumulativeThisMonth);
    for (let i = 1; i < cum.length; i++) {
      // once past "today" the mock zeroes future days; guard the comparison so
      // the running-total invariant is checked only over populated days.
      if (cum[i] === 0 && cum[i - 1] > 0) continue;
      expect(cum[i]).toBeGreaterThanOrEqual(cum[i - 1]);
    }
  });

  it('zeroes cumulativeThisMonth for days after today rather than projecting spend', async () => {
    const todayDay = new Date().getDate();
    const stats = await mockGetStats();
    for (const p of stats.spendingPace) {
      if (p.day > todayDay) expect(p.cumulativeThisMonth).toBe(0);
    }
  });
});

describe('mockGetStats — #132 rolling-window fields', () => {
  it('returns one windowTotals row per rolling window (30d/3mo/12mo)', async () => {
    const stats = await mockGetStats();
    expect(stats.windowTotals.map((w) => w.window).sort()).toEqual(['12mo', '30d', '3mo']);
  });

  it('each windowTotals row satisfies net = incoming - outgoing', async () => {
    const stats = await mockGetStats();
    for (const w of stats.windowTotals) {
      expect(w.net).toBeCloseTo(w.incoming - w.outgoing);
    }
  });

  it('a wider window never has less outgoing than a narrower one (mock entries are all in the trailing weeks)', async () => {
    const stats = await mockGetStats();
    const byWindow = Object.fromEntries(stats.windowTotals.map((w) => [w.window, w]));
    expect(byWindow['3mo'].outgoing).toBeGreaterThanOrEqual(byWindow['30d'].outgoing);
    expect(byWindow['12mo'].outgoing).toBeGreaterThanOrEqual(byWindow['3mo'].outgoing);
  });

  it('windowCategorySpend covers every (window, category) pair', async () => {
    const stats = await mockGetStats();
    const windows = new Set(stats.windowCategorySpend.map((w) => w.window));
    const categories = new Set(stats.windowCategorySpend.map((w) => w.category));
    expect(windows.size).toBe(3);
    expect(stats.windowCategorySpend.length).toBe(windows.size * categories.size);
  });

  it('windowCategorySpend outgoing sums (per window) do not exceed the window total outgoing', async () => {
    const stats = await mockGetStats();
    for (const w of stats.windowTotals) {
      const sum = stats.windowCategorySpend
        .filter((c) => c.window === w.window)
        .reduce((s, c) => s + c.outgoing, 0);
      expect(sum).toBeLessThanOrEqual(w.outgoing + 0.001);
    }
  });
});

describe('mock entries — daysAgo local-date semantics', () => {
  const originalTZ = process.env.TZ;
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTZ;
    vi.resetModules();
  });

  it('the freshest mock entry lands on the local calendar day, not the UTC day', async () => {
    process.env.TZ = 'America/New_York'; // UTC-4 in summer (EDT)
    vi.useFakeTimers();
    // 2026-05-24T02:00:00Z is still 2026-05-23 22:00 in New York.
    vi.setSystemTime(new Date('2026-05-24T02:00:00Z'));
    vi.resetModules();

    const { mockGetEntries } = await import('./mock');
    const entries = await mockGetEntries();
    const maxDate = entries.reduce((m, e) => (e.date > m ? e.date : m), entries[0].date);

    expect(maxDate).toBe('2026-05-23');
  });
});
