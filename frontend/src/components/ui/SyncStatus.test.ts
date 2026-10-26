import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import type { GatewayAdapter } from '../../lib/types';
import SyncStatus from './SyncStatus.svelte';
import { store } from '../../lib/store.svelte';
import { setAdapter } from '../../lib/api';
import { setConnection } from '../../lib/connection.svelte';

afterEach(() => { store?.dispose(); vi.restoreAllMocks(); });

it('opens a named status modal without fetching and offers explicit refresh', async () => {
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
  const dialog = view.getByRole('dialog', { name: 'Sync status' });
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(view.getByRole('heading', { name: 'Up to date' })).toBeVisible();
  expect(dialog).toHaveTextContent('Confirmed data from Sheets');
  expect(adapter.getEntries).toHaveBeenCalledTimes(1);
  await fireEvent.click(view.getByRole('button', { name: 'Refresh data' }));
  expect(adapter.getEntries).toHaveBeenCalledTimes(2);
  await fireEvent.click(view.getByRole('button', { name: 'Close sync status' }));
  await waitFor(() => expect(view.queryByRole('dialog')).not.toBeInTheDocument());
  expect(adapter.getEntries).toHaveBeenCalledTimes(2);
});
