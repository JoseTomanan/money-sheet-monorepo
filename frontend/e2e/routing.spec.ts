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

test('browser Back restores the prior route scroll position', async ({ page }) => {
  await page.goto('/#/home');
  await waitForAppReady(page);
  const scrollArea = page.locator('.scroll-area');
  await scrollArea.evaluate((element) => {
    element.style.height = '100px';
    element.scrollTop = 120;
    element.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(() => scrollArea.evaluate((element) => element.scrollTop)).toBe(120);

  await page.getByRole('button', { name: 'Summary' }).click();
  await expect.poll(() => scrollArea.evaluate((element) => element.scrollTop)).toBe(0);

  await page.goBack();
  await expect(page).toHaveURL(/#\/home$/);
  await expect.poll(() => scrollArea.evaluate((element) => element.scrollTop)).toBe(120);
});
