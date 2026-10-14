import { afterEach, expect, it, vi } from 'vitest';
import { RealAdapter, isQueueable } from './adapter-real';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('bounds fetch and body consumption together with the original fifteen-second deadline', async () => {
  vi.useFakeTimers();
  const adapter = new RealAdapter(() => ({ gasUrl: 'https://deadline.example', apiSecret: 'test' }));
  vi.stubGlobal('fetch', vi.fn(async () => {
    await new Promise(resolve => setTimeout(resolve, 10_000));
    return { text: () => new Promise(() => {}) };
  }));
  let failure: unknown;
  const request = adapter.addEntry({ date: '2026-10-11', tag: 'FOOD', amount: 10, description: 'Lunch', direction: 'I' }).catch(error => { failure = error; });
  await vi.advanceTimersByTimeAsync(14_999);
  expect(failure).toBeUndefined();
  await vi.advanceTimersByTimeAsync(1);
  expect(isQueueable(failure)).toBe(true);
  expect((failure as Error).message).toBe('Request timed out.');
  await request;
});
