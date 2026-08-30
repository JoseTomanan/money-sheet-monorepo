import { expect, test, type Page } from '@playwright/test';

async function waitForAppReady(page: Page) {
  await page.locator('.app-shell').waitFor({ state: 'visible' });
  await page.locator('.loading-spinner').waitFor({ state: 'detached' });
}

test('direct canonical hash routes render their matching views', async ({ page }) => {
  await page.goto('/#/summary');
  await waitForAppReady(page);
  await expect(page.getByText('Funds health')).toBeVisible();

  await page.goto('/#/entries/2025-01-05');
  await waitForAppReady(page);
  await expect(page.locator('[data-week-trigger]')).toContainText(/jan 5/i);
  await expect(page).toHaveURL(/#\/entries\/2025-01-05$/);
});

test('UI route navigation updates the hash and browser Back restores the prior view', async ({ page }) => {
  await page.goto('/#/summary');
  await waitForAppReady(page);

  await page.getByRole('button', { name: 'Deeper statistics' }).click();
  await expect(page).toHaveURL(/#\/summary\/statistics$/);
  await expect(page.getByText('Deeper stats')).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#\/summary$/);
  await expect(page.getByText('Funds health')).toBeVisible();

  await page.getByRole('button', { name: 'Entries' }).click();
  await expect(page).toHaveURL(/#\/entries\/\d{4}-\d{2}-\d{2}$/);
});
