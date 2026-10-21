import { expect, test } from '@playwright/test';

// The real adapter sends intercepted HTTP requests; never contacts Sheets.
test('cold startup, ten reconciliations, reload, and accessible force refresh have bounded read counts', async ({ page }) => {
  const reads: Record<string, number> = {};
  let currency = '$';
  let categories = { FOOD: ['Dining'] };
  await page.addInitScript(() => {
    localStorage.setItem('ms_connection', JSON.stringify({ gasUrl: 'https://metadata.example/exec', apiSecret: 'test' }));
    localStorage.setItem('ms_mock_dismissed', '1');
  });
  await page.route('https://metadata.example/**', async route => {
    const action = new URL(route.request().url()).searchParams.get('action')!;
    reads[action] = (reads[action] ?? 0) + 1;
    await route.fulfill({ json: {
      getEntries: { entries: [] }, getMaster: { master: { onHand: 100, budgets: { FOOD: 100 } } },
      getCategories: { categories }, getConfig: { config: { currency } },
      getStats: { stats: { categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] } },
    }[action] });
  });
  await page.goto('/');
  const status = page.locator('.sync-status');
  await expect(status).toHaveAttribute('data-sync-phase', 'ready');
  expect(reads).toEqual({ getEntries: 1, getMaster: 1, getStats: 1, getCategories: 1, getConfig: 1 });
  for (let i = 0; i < 10; i++) {
    await page.evaluate(async () => {
      const path = '/money-sheet-monorepo/src/lib/store.svelte.ts';
      const { store } = await import(path);
      await store.refreshAll(true);
    });
    await expect(status).toHaveAttribute('data-sync-phase', 'ready');
  }
  expect(reads).toEqual({ getEntries: 11, getMaster: 11, getStats: 11, getCategories: 1, getConfig: 1 });
  await page.reload();
  await expect(status).toHaveAttribute('data-sync-phase', 'ready');
  expect(reads).toEqual({ getEntries: 12, getMaster: 12, getStats: 12, getCategories: 1, getConfig: 1 });
  currency = 'USD'; categories = { FOOD: ['New category'] };
  await status.focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Tab');
  const refresh = page.getByRole('button', { name: 'Refresh data', exact: true });
  await expect(refresh).toBeFocused(); await page.keyboard.press('Enter');
  await expect(status).toHaveAttribute('data-sync-phase', 'ready');
  expect(reads).toEqual({ getEntries: 13, getMaster: 13, getStats: 13, getCategories: 2, getConfig: 2 });
  const metadata = await page.evaluate(async () => {
    const path = '/money-sheet-monorepo/src/lib/store.svelte.ts';
    const { store } = await import(path);
    return { currency: store.config.currency, food: store.categories.FOOD };
  });
  expect(metadata).toEqual({ currency: 'USD', food: ['New category'] });
  await page.keyboard.press('Escape');
  await status.click(); await refresh.click();
  await expect(status).toHaveAttribute('data-sync-phase', 'ready');
  expect(reads.getCategories).toBe(3); expect(reads.getConfig).toBe(3);
});
