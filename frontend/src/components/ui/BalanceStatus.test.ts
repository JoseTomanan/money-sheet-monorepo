import { beforeEach, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import BalanceStatus from './BalanceStatus.svelte';

const mockStore = vi.hoisted(() => ({ hasSnapshot: true, hasStats: true, statsStale: true, balancesStale: false, statisticsAwaitingSync: false, lastUpdated: 1_792_000_000_000 }));
vi.mock('../../lib/store.svelte', () => ({ store: mockStore }));
beforeEach(() => { mockStore.hasSnapshot = true; mockStore.hasStats = true; mockStore.balancesStale = false; mockStore.statisticsAwaitingSync = false; });
it('identifies ordinary refresh values by their last confirmed update', () => {
  const { getByRole } = render(BalanceStatus, { statistics: true });
  expect(getByRole('status')).toHaveTextContent('Last updated');
});
it('identifies write-stale statistics even after core balances reconcile', () => {
  mockStore.statisticsAwaitingSync = true;
  const { getByRole } = render(BalanceStatus, { statistics: true });
  expect(getByRole('status')).toHaveTextContent('Balances awaiting sync');
});
it('identifies unavailable statistics without suggesting zero balances', () => {
  mockStore.hasStats = false;
  const { getByRole } = render(BalanceStatus, { statistics: true });
  expect(getByRole('status')).toHaveTextContent('Statistics awaiting first update');
});
