import { expect, test } from './fixtures';

test('pointer entrance is interruptible by keyboard while choices remain usable', async ({ page }) => {
  await page.goto('/#/entries/');
  await page.getByRole('button', { name: 'Add entry', exact: true }).click();
  const sheet = page.locator('.sheet[data-state="open"]');
  const food = sheet.getByRole('button', { name: 'FOOD', exact: true });
  const row = sheet.locator('.picker-row').first();
  await food.click();
  await expect(sheet.getByRole('button', { name: 'Dining', exact: true })).toBeVisible();
  await expect(row).toHaveClass(/picker-entrance/);
  await page.keyboard.press('ArrowRight');
  await expect(row).not.toHaveClass(/picker-entrance/);
  await expect(row).toHaveCSS('opacity', '1');
  await sheet.getByRole('button', { name: 'Dining', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'Dining', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('reduced motion preference change settles the current entrance', async ({ page }) => {
  await page.goto('/#/entries/');
  await page.getByRole('button', { name: 'Add entry', exact: true }).click();
  const sheet = page.locator('.sheet[data-state="open"]');
  const row = sheet.locator('.picker-row').first();
  await sheet.getByRole('button', { name: 'FOOD', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(row).toHaveCSS('opacity', '1');
  await expect(row).not.toHaveClass(/picker-entrance/);
  await sheet.getByRole('button', { name: 'FOOD', exact: true }).click();
  await expect(sheet.getByRole('button', { name: 'TRANSIT', exact: true })).toBeVisible();
});
