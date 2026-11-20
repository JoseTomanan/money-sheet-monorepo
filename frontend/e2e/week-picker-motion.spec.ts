import { expect, test } from './fixtures';

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`week picker opens and closes immediately with ${reducedMotion} motion`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto('/#/entries/');
    const trigger = page.locator('[data-week-trigger]');
    await trigger.click();
    const row = page.locator('[data-week-row]').first();
    await expect(row).toBeVisible();
    const content = page.locator('[data-week-row]').first().locator('xpath=ancestor::*[@data-state][1]');
    await expect(content).toHaveCSS('animation-name', 'none');
    await trigger.click();
    await expect(page.locator('[data-week-row]')).toHaveCount(0);
  });
}
