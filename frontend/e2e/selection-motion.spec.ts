import { expect, test } from './fixtures';

test('pointer exit makes the retained action bar inert and re-entry reuses it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/entries/');
  const select = page.getByRole('button', { name: 'Enter bulk-select mode' });
  await select.click();
  await page.getByRole('button', { name: 'Select all' }).click();
  const bar = page.locator('.select-bar');
  await expect(bar).toHaveCount(1);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(bar).toHaveAttribute('inert', '');
  await expect(bar).toHaveAttribute('aria-hidden', 'true');
  await select.click();
  await expect(bar).toHaveCount(1);
  await expect(bar).not.toHaveAttribute('inert', '');
  await expect(bar).toContainText('0 selected');
  await page.waitForTimeout(200);
  await expect(bar).toHaveCount(1);
});

test('keyboard activation after pointer use is immediate and restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/entries/');
  const select = page.getByRole('button', { name: 'Enter bulk-select mode' });
  await select.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.select-bar')).toHaveCount(0);
  await select.focus();
  await page.keyboard.press('Enter');
  const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
  await expect(cancel).toBeFocused();
  await expect(page.locator('.select-bar')).toHaveCSS('opacity', '1');
  await page.keyboard.press('Enter');
  await expect(select).toBeFocused();
  await expect(page.locator('.select-bar')).toHaveCount(0);
});

test('accepted pointer deletion never restores focus to the exiting Delete button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/entries/');
  await page.getByRole('button', { name: 'Enter bulk-select mode' }).click();
  await page.getByRole('button', { name: 'Select all' }).click();
  await page.locator('.delete-sel-btn').click();
  await page.getByRole('dialog').getByRole('button', { name: /^Delete .*entr/ }).click();
  await expect(page.getByRole('button', { name: 'Enter bulk-select mode' })).toBeFocused();
});

test('reduced motion removes translation and desktop selection exits immediately', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/entries/');
  await page.getByRole('button', { name: 'Enter bulk-select mode' }).click();
  const bar = page.locator('.select-bar');
  await expect(bar).toHaveCSS('transform', 'none');
  await page.setViewportSize({ width: 1024, height: 844 });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(bar).toHaveCount(0);
});

test('dismissing confirmation restores the active Delete opener and selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/entries/');
  await page.getByRole('button', { name: 'Enter bulk-select mode' }).click();
  await page.getByRole('button', { name: 'Select all' }).click();
  const opener = page.locator('.delete-sel-btn');
  await opener.click();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await expect(opener).toBeEnabled();
});

test('synthesized activation does not borrow a previous pointer origin', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/entries/');
  const select = page.getByRole('button', { name: 'Enter bulk-select mode' });
  await select.click();
  await page.keyboard.press('Escape');
  await select.dispatchEvent('click', { detail: 1 });
  await expect(page.locator('.select-bar')).toHaveCSS('opacity', '1');
  await page.getByRole('button', { name: 'Cancel', exact: true }).dispatchEvent('click', { detail: 1 });
  await expect(page.locator('.select-bar')).toHaveCount(0);
});
