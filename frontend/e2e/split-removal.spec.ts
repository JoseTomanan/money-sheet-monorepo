import { test, expect } from './fixtures';

for (const width of [390, 1440]) {
  test(`pointer removal is visible above the sheet at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Add entry', exact: true }).click();
    const sheet = page.locator('.sheet[data-state="open"]');
    await sheet.evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
    await sheet.getByRole('button', { name: 'Add leg', exact: true }).click();
    await sheet.getByLabel('Amount for leg 2').fill('42');
    await page.evaluate(() => {
      const original = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        const animation = original.apply(this, args);
        if (this.hasAttribute('inert')) { animation.pause(); animation.currentTime = 40; }
        return animation;
      };
    });
    await sheet.getByRole('button', { name: 'Remove', exact: true }).last().click();
    const ghost = page.locator('body > div > .leg-card[inert]');
    await expect(ghost).toBeVisible();
    await expect(sheet.getByLabel('Amount for leg 1')).toBeFocused();
    expect(await ghost.evaluate(el => {
      const layer = el.parentElement!;
      return [getComputedStyle(layer).zIndex, getComputedStyle(layer).overflow];
    })).toEqual(['201', 'hidden']);
    await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(ghost).toHaveCount(0);
  });
}
