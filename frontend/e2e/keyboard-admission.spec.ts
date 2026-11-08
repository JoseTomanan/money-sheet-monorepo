import { expect, test } from '@playwright/test';
import type { Entry } from '../src/lib/types';

test('keyboard saves and bulk deletion retain intent when actual localStorage admission is refused', async ({ page }) => {
  let entries: Entry[] = [{ id: 1, row: 3, date: '2026-11-08', tag: 'FOOD', mainCategory: 'FOOD', direction: 'O', description: 'Existing lunch', amount: 10 }];
  let writes = 0;
  await page.addInitScript(() => {
    localStorage.setItem('ms_connection', JSON.stringify({ gasUrl: 'https://keyboard.example/exec', apiSecret: 'test' }));
    localStorage.setItem('ms_mock_dismissed', '1');
  });
  await page.route('https://keyboard.example/**', async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      writes++;
      const body = request.postDataJSON();
      const legs = body.action === 'addEntries' ? body.entries : [body];
      const saved = legs.map((leg, index) => ({ ...leg, id: 100 + entries.length + index, row: 4 + entries.length + index, mainCategory: 'FOOD' }));
      entries.push(...saved);
      await route.fulfill({ json: body.action === 'addEntries' ? { entries: saved } : { entry: saved[0] } });
    } else {
      const action = new URL(request.url()).searchParams.get('action');
      await route.fulfill({ json: {
        getEntries: { entries }, getMaster: { master: { onHand: 100, budgets: { FOOD: 100 } } },
        getCategories: { categories: { FOOD: ['Dining', 'Groceries'] } }, getConfig: { config: { currency: '$' } },
        getStats: { stats: { categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] } },
      }[action!] });
    }
  });
  await page.goto('/#/entries/2026-11-08');
  await expect(page.getByRole('button', { name: 'Add entry', exact: true })).toBeVisible();
  await page.keyboard.press('Shift+N');
  const sheet = page.locator('.sheet[data-state="open"]');
  await sheet.locator('input[type="date"]').fill('2026-11-08');
  await sheet.getByRole('button', { name: 'FOOD', exact: true }).click();
  await sheet.getByPlaceholder('0.00').fill('100-30');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as any).restoreKeyboardStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('ms_queue:v2:')) throw new DOMException('Storage full', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await page.keyboard.press('Control+Enter');
  await expect(sheet.getByRole('alert')).toContainText("Couldn't write pending saves on this device");
  await expect(sheet.getByPlaceholder('0.00')).toHaveValue('100-30');
  expect(writes).toBe(0);
  await page.evaluate(() => (window as any).restoreKeyboardStorage());
  await page.keyboard.press('Control+Enter');
  await expect(sheet).toHaveCount(0);
  await expect.poll(() => writes).toBe(1);
  await expect(page.locator('[data-entry-row]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Enter bulk-select mode' }).click();
  await page.keyboard.press('Control+a');
  await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
  await page.keyboard.press('Delete');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('ms_queue:v2:')) throw new DOMException('Storage full', 'QuotaExceededError');
      original.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'Delete 2 entries', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('2 selected', { exact: true })).toBeVisible();
  expect(writes).toBe(1);
});
