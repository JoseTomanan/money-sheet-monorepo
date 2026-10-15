import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import type { GatewayAdapter } from '../../lib/types';
import SyncStatus from './SyncStatus.svelte';
import { store } from '../../lib/store.svelte';
import { setAdapter } from '../../lib/api';
import { setConnection } from '../../lib/connection.svelte';

afterEach(() => { store?.dispose(); vi.restoreAllMocks(); });

it('offers compact status details and refresh through a keyboard/touch button', async () => {
  localStorage.clear();

  const adapter: GatewayAdapter = {
    getEntries: vi.fn(async () => []), getMaster: async () => ({ onHand: 100, budgets: {} }),
    getCategories: async () => ({}), getConfig: async () => ({ currency: '$' }),
    getStats: async () => ({ categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] }),
    addEntry: vi.fn(), addEntries: vi.fn(), updateEntry: vi.fn(), deleteEntry: vi.fn(), validateConnection: vi.fn(),
  };
  setAdapter(adapter);
  setConnection({ gasUrl: 'https://status.example', apiSecret: 'test' });
  await store.init();
  const view = render(SyncStatus);
  const trigger = view.getByRole('button', { name: /Up to date/ });
  expect(trigger.textContent?.trim()).toBe('');
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await fireEvent.click(trigger);
  expect(view.getByRole('region', { name: 'Sync details' })).toHaveTextContent('Confirmed data from Sheets');
  await fireEvent.click(view.getByRole('button', { name: 'Refresh data' }));
  expect(adapter.getEntries).toHaveBeenCalledTimes(2);
  await fireEvent.keyDown(trigger, { key: 'Escape' });
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
});
