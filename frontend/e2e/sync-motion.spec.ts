import { expect, test } from './fixtures';

test('pointer opening animates the centered dialog while keyboard opening is immediate', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const trigger = page.locator('.sync-status');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Sync status', exact: true });
  await expect(dialog).toBeVisible();
  const motion = await dialog.evaluate(el => el.getAnimations().map(a => a.effect?.getTiming().duration));
  expect(motion).toContain(200);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el => el.getAnimations().length)).toBe(0);
});

test('pointer close returns focus immediately and removes the backdrop after the exit', async ({ page }) => {
  await page.goto('/');
  const trigger = page.locator('.sync-status');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Sync status', exact: true });
  await dialog.evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
  await dialog.getByRole('button', { name: 'Close sync status' }).click();
  expect(await dialog.evaluate(el => el.getAnimations().map(a => a.effect?.getTiming().duration))).toContain(200);
  await expect(trigger).toBeFocused({ timeout: 100 });
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-dialog-overlay]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

test('reduced motion fades without scaling and keyboard interaction settles it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.locator('.sync-status').click();
  const dialog = page.getByRole('dialog', { name: 'Sync status', exact: true });
  await expect(dialog).toBeVisible();
  const result = await dialog.evaluate(el => ({
    scale: getComputedStyle(el).scale,
    animations: el.getAnimations().map(a => a.effect?.getTiming().duration),
  }));
  expect(['none', '1']).toContain(result.scale);
  expect(result.animations).toContain(80);
  await page.keyboard.press('Tab');
  expect(await dialog.evaluate(el => el.getAnimations().length)).toBe(0);
});

test('backdrop pointer dismissal fades without requesting data', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (request.url().startsWith('https://')) requests.push(request.url()); });
  await page.goto('/');
  await page.locator('.sync-status').click();
  const dialog = page.getByRole('dialog', { name: 'Sync status', exact: true });
  await dialog.evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
  await page.mouse.click(5, 150);
  expect(await dialog.evaluate(el => el.getAnimations().map(a => a.effect?.getTiming().duration))).toContain(200);
  await expect(dialog).toHaveCount(0);
  expect(requests).toEqual([]);
});

test('an incomplete backdrop press does not start presentation motion', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sync-status').click();
  const dialog = page.getByRole('dialog', { name: 'Sync status', exact: true });
  await dialog.evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
  await page.mouse.move(5, 150);
  await page.mouse.down();
  await page.waitForTimeout(30);
  expect(await dialog.evaluate(el => el.getAnimations().length)).toBe(0);
  await page.mouse.up();
});

test('changing reduced-motion preference settles an entrance immediately', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.locator('.sync-status').click();
  const dialog = page.getByRole('dialog', { name: 'Sync status', exact: true });
  await expect(dialog).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(() => dialog.evaluate(el => el.getAnimations().length)).toBe(0);
  expect(await dialog.evaluate(el => getComputedStyle(el).opacity)).toBe('1');
});

test('keyboard input during pointer exit removes the modal without reopening it', async ({ page }) => {
  await page.goto('/');
  const trigger = page.locator('.sync-status');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Sync status', exact: true });
  await dialog.evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
  await dialog.getByRole('button', { name: 'Close sync status' }).click();
  await page.keyboard.press('Tab');
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('[data-dialog-overlay]')).toHaveCount(0);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('the dialog stays centered during pointer entrance', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.sync-status').click();
  const dialog = page.getByRole('dialog', { name: 'Sync status', exact: true });
  await expect(dialog).toBeVisible();
  const frame = await dialog.evaluate(el => {
    for (const animation of el.getAnimations()) { animation.pause(); animation.currentTime = 100; }
    const rect = el.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, opacity: Number(getComputedStyle(el).opacity) };
  });
  expect(frame.x).toBeCloseTo(195, 0);
  expect(frame.y).toBeCloseTo(422, 0);
  expect(frame.opacity).toBeGreaterThan(0);
  expect(frame.opacity).toBeLessThan(1);
  await page.screenshot({ path: testInfo.outputPath('sync-entrance.png') });
});
