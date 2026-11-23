import { expect, test } from './fixtures';

test('mobile dock owns Add and replaces it with Cancel during selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/entries/');
  const dock = page.locator('.tab-bar-pill');
  const add = dock.getByRole('button', { name: 'Add entry' });
  await expect(add).toBeVisible();
  const hash = await page.evaluate(() => location.hash);
  await add.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => location.hash)).toBe(hash);
  await page.keyboard.press('Escape');
  await expect(add).toBeFocused();
  await page.getByRole('button', { name: 'Enter bulk-select mode' }).click();
  await expect(dock.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await expect(page.locator('.select-bar')).toContainText('0 selected');
  await dock.getByRole('button', { name: 'Cancel' }).click();
  await expect(add).toBeVisible();
});

test('selection keeps navigation positions and places its actions above the dock', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/#/entries/');
  const dock = page.locator('.tab-bar-pill');
  const entries = dock.getByRole('button', { name: 'Entries' });
  const before = (await entries.boundingBox())!;
  await page.getByRole('button', { name: 'Enter bulk-select mode' }).click();
  const after = (await entries.boundingBox())!;
  expect(after.x).toBe(before.x);
  expect(after.width).toBe(before.width);
  const bar = (await page.locator('.select-bar').boundingBox())!;
  const dockBox = (await dock.boundingBox())!;
  expect(bar.x).toBe(dockBox.x);
  expect(bar.width).toBe(dockBox.width);
  expect(bar.y + bar.height).toBeLessThanOrEqual(dockBox.y);
  await expect(page.locator('.delete-sel-btn')).toBeDisabled();
});

for (const width of [320, 390, 430, 1023, 1024]) {
  test(`dock and Add remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/#/home');
    const dock = page.locator('.tab-bar-pill');
    const add = page.getByRole('button', { name: 'Add entry', exact: true });
    await expect(add).toBeVisible();
    await expect(dock.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(await dock.getByRole('button', { name: 'Add entry' }).isVisible()).toBe(width < 1024);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const name of ['Home', 'Entries', 'Summary']) {
      const box = (await dock.getByRole('button', { name }).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
  });
}

test('touch Add returns focus to the dock without focusing Amount on open', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto('/#/home');
  const add = page.locator('.tab-bar-pill').getByRole('button', { name: 'Add entry' });
  await add.tap();
  await expect(page.locator('[data-entry-amount]')).not.toBeFocused();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).tap();
  await expect(add).toBeFocused();
  await context.close();
});

test('keyboard shortcut without a focused opener returns to the visible Add control', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/home');
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await page.keyboard.press('Shift+N');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.tab-bar-pill').getByRole('button', { name: 'Add entry' })).toBeFocused();
});

test('enlarged text keeps the dock and selection row usable without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/#/entries/');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await page.getByRole('button', { name: 'Enter bulk-select mode' }).click();
  const dock = page.locator('.tab-bar-pill');
  const bar = page.locator('.select-bar');
  await expect(dock.getByRole('button', { name: 'Cancel' })).toBeVisible();
  expect((await bar.boundingBox())!.y + (await bar.boundingBox())!.height).toBeLessThanOrEqual((await dock.boundingBox())!.y);
  const dockBox = (await dock.boundingBox())!;
  for (const name of ['Home', 'Entries', 'Summary', 'Cancel']) {
    const box = (await dock.getByRole('button', { name }).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(dockBox.x);
    expect(box.x + box.width).toBeLessThanOrEqual(dockBox.x + dockBox.width);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('an actionable notification stays above selection controls', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/#/entries/');
  await page.getByRole('button', { name: 'Enter bulk-select mode' }).click();
  await page.evaluate(async () => {
    const path = '/money-sheet-monorepo/src/lib/toast.svelte.ts';
    const { toast } = await import(path);
    toast.show('Try again', { label: 'Retry', run: () => toast.dismiss() }, 'destructive');
  });
  const notification = page.getByRole('region', { name: 'Notification' });
  await expect(notification).toBeVisible();
  const box = (await notification.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual((await page.locator('.select-bar').boundingBox())!.y);
  await notification.getByRole('button', { name: 'Retry' }).click();
  await expect(notification).toBeHidden();
});
