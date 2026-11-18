import { test, expect } from './fixtures';

test('Home preserves cold, unavailable, empty, stale and local states with long financial content', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-09-11T12:00:00+08:00'));
  await page.addInitScript(() => {
    localStorage.setItem('ms_connection', JSON.stringify({ gasUrl: 'https://home.example/exec', apiSecret: 'test' }));
    localStorage.setItem('ms_mock_dismissed', '1');
  });
  let release!: () => void;
  const cold = new Promise<void>(resolve => { release = resolve; });
  let fail = false;
  await page.route('https://home.example/**', async route => {
    await cold;
    if (fail || route.request().method() === 'POST') { await route.abort(); return; }
    const action = new URL(route.request().url()).searchParams.get('action');
    await route.fulfill({ json: {
      getEntries: { entries: [] },
      getMaster: { master: { onHand: -9999999999999.99, budgets: { FOOD: 0, HOUSING: 9999999999999.99, TRANSIT: -45 } } },
      getCategories: { categories: { FOOD: ['Dining'] } },
      getConfig: { config: { currency: 'CHF ', nickname: 'Alexandra with a long household name' } },
      getStats: { stats: { categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] } },
    }[action!] });
  });
  await page.goto('/');
  await expect(page.locator('.home [class*="shimmer"]').first()).toBeVisible();
  await expect(page.locator('.hero-amount')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('cold.png') });
  release();
  await expect(page.locator('.hero-amount')).toContainText('-CHF 9,999,999,999,999.99');
  await expect(page.getByText('No entries yet.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Budget unavailable')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Open settings', exact: true })).toBeInViewport();
  await expect(page.locator('.cat-chip', { hasText: 'Food' })).toContainText('CHF 0.00');
  await page.screenshot({ path: test.info().outputPath('empty-unavailable.png') });
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 1000 });
    const overflows = await page.locator('.home').evaluate(el => Array.from(el.querySelectorAll('.hero-amount, .cat-chip, .page-header')).some(el => el.scrollWidth > el.clientWidth + 1));
    expect(overflows, 'enlarged text and large amounts must wrap inside their section').toBe(false);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  await page.addStyleTag({ content: 'html { font-size: 100%; }' });
  fail = true;
  await page.getByRole('button', { name: 'Add entry', exact: true }).click();
  await page.locator('.amount-input').fill('20');
  await page.locator('.field-input').first().fill('Lunch saved locally with a long description');
  await page.locator('.tag-pill', { hasText: 'FOOD' }).first().click();
  await page.locator('.tag-pill', { hasText: 'Dining' }).click();
  await page.locator('button.header-btn.save').click();
  await expect(page.locator('.sheet[data-state="open"]')).toHaveCount(0);
  await expect(page.getByText('Balances awaiting sync', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Not yet synced')).toBeVisible();
  await expect(page.locator('.hero-amount')).toContainText('-CHF 9,999,999,999,999.99');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize({ width: 390, height: 1400 });
  await page.locator('.scroll-area').evaluate(el => el.scrollTo({ top: 0 }));
  await page.screenshot({ path: test.info().outputPath('stale-local-dark.png') });
});
