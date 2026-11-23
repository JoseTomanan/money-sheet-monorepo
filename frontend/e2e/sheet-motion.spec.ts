import { expect, test } from './fixtures';

test('reduced motion fades Settings and its backdrop without moving the sheet', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const opener = page.getByRole('button', { name: 'Open settings' });
  await opener.click();
  const sheet = page.getByRole('dialog', { name: 'Settings' });
  const backdrop = page.locator('[data-dialog-overlay]');
  await expect(sheet).toBeVisible();
  const motion = await sheet.evaluate(el => {
    const style = getComputedStyle(el);
    return { duration: style.animationDuration, easing: style.animationTimingFunction,
      frames: (el.getAnimations()[0] as CSSAnimation).effect instanceof KeyframeEffect
        ? ((el.getAnimations()[0] as CSSAnimation).effect as KeyframeEffect).getKeyframes() : [] };
  });
  expect(motion.duration).toBe('0.08s');
  expect(motion.easing).toBe('cubic-bezier(0.23, 1, 0.32, 1)');
  expect(motion.frames.every(frame => !('transform' in frame))).toBe(true);
  await expect(backdrop).toHaveCSS('animation-duration', '0.08s');
  await sheet.evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await sheet.getByRole('button', { name: 'Done' }).click();
  const closing = page.locator('.sheet[data-state="closed"]');
  const closingBackdrop = page.locator('[data-dialog-overlay][data-state="closed"]');
  await expect(closing).toHaveCSS('animation-duration', '0.08s');
  await expect(closingBackdrop).toHaveCSS('animation-duration', '0.08s');
  await expect(closing).toHaveCSS('animation-timing-function', 'cubic-bezier(0.23, 1, 0.32, 1)');
  await expect(closingBackdrop).toHaveCSS('animation-timing-function', 'cubic-bezier(0.23, 1, 0.32, 1)');
  await page.clock.resume();
  await expect(sheet).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('normal Settings keeps the original slide and backdrop timing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const opener = page.getByRole('button', { name: 'Open settings' });
  await opener.focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog', { name: 'Settings' });
  const backdrop = page.locator('[data-dialog-overlay]');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveCSS('animation-duration', '0.28s');
  await expect(backdrop).toHaveCSS('animation-duration', '0.28s');
  expect(await sheet.evaluate(el => getComputedStyle(el).getPropertyValue('--tw-enter-translate-y').trim())).toBe('100%');
  await page.keyboard.press('Escape');
  await expect(page.locator('.sheet[data-state="closed"]')).toHaveCSS('animation-duration', '0.28s');
  await expect(page.locator('[data-dialog-overlay][data-state="closed"]')).toHaveCSS('animation-duration', '0.22s');
  await expect(sheet).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('reduced-motion Edit Entry fades at its drag release position', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Entries', exact: true }).click();
  const opener = page.locator('[data-entry-row]').first();
  await opener.click();
  const sheet = page.locator('.sheet[data-state="open"]');
  await expect(sheet).toBeVisible();
  await sheet.evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
  const box = (await sheet.getByRole('separator').boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 160);
  await expect.poll(() => sheet.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m42)).toBeCloseTo(160, 0);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await page.mouse.up();
  const closing = page.locator('.sheet[data-state="closed"]');
  await expect(closing).toHaveCount(1);
  const released = await closing.evaluate(el => {
    const animation = el.getAnimations()[0];
    animation.pause(); animation.currentTime = 40;
    return { offset: new DOMMatrix(getComputedStyle(el).transform).m42,
      duration: animation.effect!.getTiming().duration,
      frames: (animation.effect as KeyframeEffect).getKeyframes() };
  });
  expect(released.offset).toBeCloseTo(160, 0);
  expect(released.duration).toBe(80);
  expect(released.frames.every(frame => !('transform' in frame))).toBe(true);
  await closing.evaluate(el => el.getAnimations().forEach(a => a.play()));
  await page.clock.resume();
  await expect(closing).toHaveCount(0);
  await expect(opener).toBeFocused();
});

for (const width of [390, 1440]) {
  test(`other unmanaged sheets use reduced-motion fades at ${width}px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Entries', exact: true }).click();
    const verify = async () => {
      const sheet = page.locator('.sheet[data-state="open"]');
      await expect(sheet).toBeVisible();
      await expect(sheet).toHaveCSS('animation-name', 'sheet-fade-in');
      await expect(sheet).toHaveCSS('animation-duration', '0.08s');
      await expect(page.locator('[data-dialog-overlay]')).toHaveCSS('animation-duration', '0.08s');
      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
    };
    await page.getByRole('button', { name: 'Redistribute', exact: true }).click();
    await verify();
    await page.getByRole('button', { name: 'Enter bulk-select mode' }).click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await verify();
    await page.keyboard.press('Escape');
    await page.locator('[data-entry-row]').first().click();
    await verify();
  });
}
