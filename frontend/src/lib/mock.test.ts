import { describe, it, expect, vi, afterEach } from 'vitest';

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
