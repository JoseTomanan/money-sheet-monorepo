import { test, expect } from '@playwright/test';

test('Settings isolates destinations and requires explicit legacy association across reload', async ({ page }) => {
  const A = { gasUrl: 'https://a.example/exec', apiSecret: 'a-secret' };
  const B = { gasUrl: 'https://b.example/exec', apiSecret: 'b-secret' };
  const payload = { date: '2026-10-14', tag: 'FOOD', description: 'older save', direction: 'I', amount: 10 };
  const deliveries: { url: string; body: Record<string, unknown> }[] = [];
  await page.addInitScript(({ A, payload }) => {
    if (localStorage.getItem('seeded')) return;
    localStorage.setItem('seeded', '1');
    localStorage.setItem('ms_connection', JSON.stringify(A));
    localStorage.setItem('ms_queue', JSON.stringify([{ op: 'add', tempId: -1, payload, mutationId: 'original-legacy-key' }]));
    localStorage.setItem('ms_cache', JSON.stringify({ entries: [{ ...payload, id: -1 }], master: { onHand: 999 }, categories: {} }));
  }, { A, payload });
  await page.route('https://*.example/**', async route => {
    const request = route.request();
    const destination = request.url().startsWith(A.gasUrl) ? 'A' : 'B';
    const action = new URL(request.url()).searchParams.get('action');
    const body = request.postDataJSON();
    if (body && body.action !== 'validate') deliveries.push({ url: request.url(), body });
    await route.fulfill({ json: body
      ? { ok: true, entry: { ...payload, id: 8, mainCategory: 'FOOD' } }
      : {
        getEntries: { entries: [] },
        getMaster: { master: { onHand: destination === 'A' ? 10 : 20, budgets: {} } },
        getCategories: { categories: { FOOD: [] } },
        getConfig: { config: { currency: '$', nickname: destination } },
        getStats: { stats: { categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] } },
      }[action!] ?? {},
    });
  });
  await page.goto('/');
  await expect(page.getByText('Older pending saves have no known destination.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Recover pending saves in Settings' }).click();
  await page.locator('#settings-gas-url').fill(B.gasUrl);
  await page.locator('#settings-api-secret').fill(B.apiSecret);
  await page.locator('.settings-content .save-btn').click();
  await expect(page.locator('.settings-content')).not.toBeVisible();
  await page.reload();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  expect(deliveries).toEqual([]);
  await page.getByRole('button', { name: 'Recover pending saves in Settings' }).click();
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Confirm original destination and recover' }).click();
  await expect(page.getByRole('button', { name: 'Confirm original destination and recover' })).toBeVisible();
  // Restore A via Settings before explicitly confirming it as the origin.
  await page.locator('#settings-gas-url').fill(A.gasUrl);
  await page.locator('#settings-api-secret').fill(A.apiSecret);
  await page.locator('.settings-content .save-btn').click();
  await page.getByRole('button', { name: 'Recover pending saves in Settings' }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Confirm original destination and recover' }).click();
  await expect(page.getByRole('button', { name: 'Confirm original destination and recover' })).not.toBeVisible();
  await page.reload();
  await expect(page.locator('.app-shell')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => deliveries.length).toBe(1);
  expect(deliveries[0]).toMatchObject({ url: A.gasUrl, body: { mutationId: 'original-legacy-key', secret: A.apiSecret } });
});
