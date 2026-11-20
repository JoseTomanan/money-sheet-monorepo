import { test, expect } from '@playwright/test';

for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
  test(`floating controls respect motion preferences at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#/entries/2026-11-15');
    const fab = page.getByRole('button', { name: 'Add entry', exact: true });
    await expect(fab).toBeVisible();
    const area = page.locator('.scroll-area');
    await area.evaluate(el => {
      const spacer = document.createElement('div');
      spacer.style.height = '2000px';
      el.appendChild(spacer);
      el.scrollTop = 500;
    });
    const top = page.getByRole('button', { name: 'Scroll to top' });
    await expect(top).toBeVisible();
    await top.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => area.evaluate(el => el.scrollTop)).toBe(0);
    await fab.hover();
    expect(await fab.evaluate(el => getComputedStyle(el).translate)).toBe('none');
    await fab.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(fab).toBeVisible();
  });
}
