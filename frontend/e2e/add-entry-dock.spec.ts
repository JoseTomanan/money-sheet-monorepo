import { test, expect } from './fixtures';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('mobile Add entry is a labelled action inside the dock', async ({ page }) => {
  await page.goto('/');
  const add = page.getByRole('button', { name: 'Add entry', exact: true });
  await expect(add).toBeVisible();
  await expect(add).toContainText('Add');
  await expect(add.locator('xpath=ancestor::*[contains(@class,"tab-bar-pill")]')).toHaveCount(1);
  const box = (await add.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await add.click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('upward pull previews the sheet without opening a dialog and commits on release', async ({ page }) => {
  await page.goto('/');
  const add = page.getByRole('button', { name: 'Add entry', exact: true });
  const box = (await add.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 100 }] });
  await expect(page.locator('[data-entry-preview]')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
});

test('a cancelled pull leaves focus and scroll in place and the next tap opens', async ({ page }) => {
  await page.goto('/');
  const add = page.getByRole('button', { name: 'Add entry', exact: true });
  await page.getByRole('button', { name: 'Home', exact: true }).focus();
  const box = (await add.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 45 }] });
  await expect(page.locator('[data-entry-preview]')).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(page.locator('[data-entry-preview]')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeFocused();
  await add.click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('reversing a pull below the threshold leaves the sheet closed', async ({ page }) => {
  await page.goto('/');
  const add = page.getByRole('button', { name: 'Add entry', exact: true });
  const box = (await add.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 110 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 20 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-entry-preview]')).toHaveCount(0);
});

test('the preview tracks upward movement directly', async ({ page }) => {
  await page.goto('/');
  const add = page.getByRole('button', { name: 'Add entry', exact: true });
  const box = (await add.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 60 }] });
  const preview = page.locator('[data-entry-preview]');
  await expect(preview).toBeVisible();
  const top = (await preview.boundingBox())!.y;
  const backdrop = page.locator('[data-entry-preview-backdrop]');
  const opacity = await backdrop.evaluate(el => Number(getComputedStyle(el).opacity));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 100 }] });
  await expect.poll(async () => (await preview.boundingBox())!.y).toBeCloseTo(top - 40, 0);
  await expect.poll(() => backdrop.evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(opacity);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
});

test('changing the breakpoint during a pull cancels the preview', async ({ page }) => {
  await page.goto('/');
  const add = page.getByRole('button', { name: 'Add entry', exact: true });
  const box = (await add.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 100 }] });
  await expect(page.locator('[data-entry-preview]')).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 844 });
  await expect(page.locator('[data-entry-preview]')).toHaveCount(0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const width of [320, 390, 430]) {
  test(`dock Add stays within safe bounds at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    const add = page.getByRole('button', { name: 'Add entry', exact: true });
    const box = (await add.boundingBox())!;
    const dock = (await page.locator('.tab-bar-pill').boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(dock.x);
    expect(box.x + box.width).toBeLessThanOrEqual(dock.x + dock.width);
    expect(box.y + box.height).toBeLessThanOrEqual(844 - 16);
  });
}

test('capture loss cancels a pull without opening the sheet', async ({ page }) => {
  await page.goto('/');
  const add = page.getByRole('button', { name: 'Add entry', exact: true });
  await add.evaluate(el => el.addEventListener('pointerdown', event => {
    (el as HTMLElement).dataset.pointer = String((event as PointerEvent).pointerId);
  }, { once: true }));
  const box = (await add.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 100 }] });
  await expect(page.locator('[data-entry-preview]')).toBeVisible();
  await add.evaluate(el => el.releasePointerCapture(Number((el as HTMLElement).dataset.pointer)));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 101 }] });
  await expect(page.locator('[data-entry-preview]')).toHaveCount(0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a quick upward flick commits after minimum travel', async ({ page }) => {
  await page.goto('/');
  const add = page.getByRole('button', { name: 'Add entry', exact: true });
  const box = (await add.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 45 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('route changes cancel an in-progress pull', async ({ page }) => {
  await page.goto('/');
  const add = page.getByRole('button', { name: 'Add entry', exact: true });
  const box = (await add.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 100 }] });
  await expect(page.locator('[data-entry-preview]')).toBeVisible();
  await page.evaluate(() => { location.hash = '#/summary'; });
  await expect(page.locator('[data-entry-preview]')).toHaveCount(0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a second grab catches the returning preview', async ({ page }) => {
  await page.goto('/');
  const add = page.getByRole('button', { name: 'Add entry', exact: true });
  const box = (await add.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 60 }] });
  await expect(page.locator('[data-entry-preview]')).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  const preview = page.locator('[data-entry-preview]');
  const top = (await preview.boundingBox())!.y;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 20 }] });
  await expect.poll(async () => (await preview.boundingBox())!.y).toBeCloseTo(top - 20, 0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
});

test('reduced motion preserves direct tracking and a short return', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const add = page.getByRole('button', { name: 'Add entry', exact: true });
  const box = (await add.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 45 }] });
  const preview = page.locator('[data-entry-preview]');
  await expect(preview).toBeVisible();
  const top = (await preview.boundingBox())!.y;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 55 }] });
  await expect.poll(async () => (await preview.boundingBox())!.y).toBeCloseTo(top - 10, 0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(preview).toHaveCount(0);
});
