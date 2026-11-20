import { expect, test } from './fixtures';

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  for (const width of [390, 1440]) {
    test(`statistics geometry updates without transitions at ${width}px with ${reducedMotion}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion });
      await page.goto('/#/summary/statistics');
      await expect(page.locator('.flow-readout')).toBeVisible();

      await expect(page.locator('.flow-readout > div > div:first-child > div')).toHaveCount(2);
      expect(await page.locator('.dist-strip > div').count()).toBeGreaterThan(0);
      expect(await page.locator('.cat-row .overflow-hidden > div').count()).toBeGreaterThan(0);
      const bars = page.locator('.flow-readout > div > div:first-child > div, .dist-strip > div, .cat-row .overflow-hidden > div');
      for (const bar of await bars.all()) {
        const transitions = await bar.evaluate((element) => {
          const style = getComputedStyle(element);
          return { property: style.transitionProperty, duration: style.transitionDuration };
        });
        expect(transitions.duration === '0s' || transitions.property === 'none').toBe(true);
      }

      await page.getByRole('radio', { name: '3 months' }).click();
      await expect(page.getByRole('radio', { name: '3 months' })).toHaveAttribute('aria-checked', 'true');
      await page.getByRole('radio', { name: '12 months' }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('radio', { name: '12 months' })).toHaveAttribute('aria-checked', 'true');
    });
  }
}
