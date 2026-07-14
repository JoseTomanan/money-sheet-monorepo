import { describe, it, expect, vi, afterEach } from 'vitest';
import { mockGetStats } from './mock';

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
