import { test, expect, type Page, type Locator } from './fixtures';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function openEntry(page: Page) {
  await page.goto('/');
  const opener = page.getByRole('button', { name: 'Add entry', exact: true });
  await opener.click();
  const sheet = page.locator('.sheet[data-state="open"]');
  await sheet.evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
  return { sheet, opener };
}

async function center(locator: Locator) {
  const box = (await locator.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function touch(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  return {
    start: (x: number, y: number) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }),
    move: (x: number, y: number) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }),
    end: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
    cancel: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }),
  };
}

const offset = (sheet: Locator) => sheet.evaluate(el => new DOMMatrix(getComputedStyle(el).transform).m42);

test('canceling a long Edit pull keeps its draft; releasing dismisses', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entries', exact: true }).click();
  await page.locator('[data-entry-row]').first().click();
  const sheet = page.locator('.sheet[data-state="open"]');
  await sheet.evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
  const draft = sheet.locator('input[type="text"]').last();
  await draft.fill('Preserved edit');
  const finger = await touch(page);
  let point = await center(sheet.getByRole('separator'));
  await finger.start(point.x, point.y);
  await finger.move(point.x, point.y + 145);
  await finger.cancel();
  await expect(draft).toHaveValue('Preserved edit');
  await expect.poll(() => offset(sheet)).toBe(0);
  point = await center(sheet.getByRole('separator'));
  await finger.start(point.x, point.y);
  await finger.move(point.x, point.y + 145);
  await finger.end();
  await expect(sheet).toHaveCount(0);
});

test('re-grabbing an Edit return follows the painted position and capture loss settles', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Entries', exact: true }).click();
  await page.locator('[data-entry-row]').first().click();
  const sheet = page.locator('.sheet[data-state="open"]');
  await sheet.evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); });
  const handle = sheet.getByRole('separator');
  const finger = await touch(page);
  const point = await center(handle);
  await finger.start(point.x, point.y);
  await finger.move(point.x, point.y + 50);
  await expect.poll(() => offset(sheet)).toBeCloseTo(50, 0);
  await finger.cancel();
  await page.waitForTimeout(70);
  const painted = await offset(sheet);
  expect(painted).toBeGreaterThan(0);
  const moving = await center(handle);
  await handle.evaluate(el => el.addEventListener('pointerdown', event => {
    (el as HTMLElement).dataset.testPointer = String((event as PointerEvent).pointerId);
  }, { once: true }));
  await finger.start(moving.x, moving.y);
  const caught = await offset(sheet);
  await finger.move(moving.x, moving.y + 20);
  await expect.poll(() => offset(sheet)).toBeCloseTo(caught + 20, 0);
  await handle.evaluate(el => el.releasePointerCapture(Number((el as HTMLElement).dataset.testPointer)));
  await finger.move(moving.x, moving.y + 21);
  await expect.poll(() => offset(sheet)).toBe(0);
  await expect(sheet).toBeVisible();
  await finger.end();
});

test('a paused short pull keeps the draft open', async ({ page }) => {
  const { sheet } = await openEntry(page);
  await sheet.getByPlaceholder('0.00').fill('42');
  const { x, y } = await center(sheet.getByRole('separator'));
  const finger = await touch(page);
  await finger.start(x, y);
  await finger.move(x, y + 42);
  await expect.poll(() => offset(sheet)).toBeGreaterThan(30);
  await page.waitForTimeout(240);
  await finger.end();
  await expect.poll(() => offset(sheet)).toBe(0);
  await expect(sheet.getByPlaceholder('0.00')).toHaveValue('42');
});

test('the title follows a vertical pull and the backdrop follows the sheet', async ({ page }) => {
  const { sheet } = await openEntry(page);
  const { x, y } = await center(sheet.getByRole('heading'));
  const height = (await sheet.boundingBox())!.height;
  const backdrop = page.locator('[data-dialog-overlay]');
  const finger = await touch(page);
  await finger.start(x, y);
  await finger.move(x + 15, y + 100);
  await expect.poll(() => offset(sheet)).toBeCloseTo(100, 0);
  await expect.poll(() => backdrop.evaluate(el => Number(getComputedStyle(el).opacity))).toBeCloseTo(1 - 100 / height, 2);
  await finger.cancel();
});

test('a canceled long pull settles open and the original draft can be saved', async ({ page }) => {
  const { sheet, opener } = await openEntry(page);
  await sheet.getByPlaceholder('0.00').fill('42');
  await sheet.getByPlaceholder('e.g. lunch at canteen').fill('Draft kept after touch cancel');
  await sheet.getByRole('button', { name: 'FOOD', exact: true }).click();
  const { x, y } = await center(sheet.getByRole('heading'));
  const finger = await touch(page);
  await finger.start(x, y);
  await finger.move(x, y + 125);
  await expect.poll(() => offset(sheet)).toBeCloseTo(125, 0);
  await finger.cancel();
  await expect.poll(() => offset(sheet)).toBe(0);
  await expect(sheet.getByPlaceholder('0.00')).toHaveValue('42');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.getByRole('button', { name: 'Entries', exact: true }).click();
  const saved = page.locator('[data-entry-row]').filter({ hasText: 'Draft kept after touch cancel' });
  await expect(saved).toContainText('42');
});

test('a quick nudge stays open, then a deliberate flick dismisses and returns focus', async ({ page }) => {
  const { sheet, opener } = await openEntry(page);
  const { x, y } = await center(sheet.getByRole('heading'));
  const finger = await touch(page);
  await finger.start(x, y);
  await finger.move(x, y + 24);
  await finger.end();
  await expect.poll(() => offset(sheet)).toBe(0);

  await finger.start(x, y);
  await finger.move(x, y + 55);
  await finger.end();
  await expect(sheet).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('a second touch catches and reverses a long pull before it closes', async ({ page }) => {
  const { sheet, opener } = await openEntry(page);
  const draft = sheet.getByPlaceholder('0.00');
  await draft.fill('73');
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const handle = sheet.getByRole('separator');
  const { x, y } = await center(handle);
  const finger = await touch(page);
  await finger.start(x, y);
  await finger.move(x, y + 140);
  await page.waitForTimeout(180);
  await finger.end();

  // Advance the close, then hold that frame while positioning the second touch.
  await page.clock.runFor(85);
  const movingOffset = await offset(sheet);
  expect(movingOffset).toBeGreaterThan(140);
  await expect(opener).not.toBeFocused();
  const movingHandle = await center(handle);
  await finger.start(movingHandle.x, movingHandle.y);
  await finger.move(x, y + 16);
  await expect.poll(() => offset(sheet)).toBeCloseTo(16, 0);
  await finger.end();
  await page.clock.runFor(250);
  await expect.poll(() => offset(sheet)).toBe(0);
  await expect(draft).toHaveValue('73');

  await finger.start(x, y);
  await finger.move(x, y + 140);
  await page.waitForTimeout(180);
  await finger.end();
  await page.clock.runFor(360);
  await expect(sheet).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('the short sheet scrolls its form without moving the grabber or actions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 350 });
  const { sheet } = await openEntry(page);
  const handle = sheet.getByRole('separator');
  const cancel = sheet.getByRole('button', { name: 'Cancel', exact: true });
  const save = sheet.getByRole('button', { name: 'Save', exact: true });
  const grabberY = (await center(handle)).y;
  const date = sheet.locator('input[type="date"]');
  await expect(date).not.toBeInViewport();
  const finger = await touch(page);
  for (let swipe = 0; swipe < 2; swipe++) {
    await finger.start(20, 310);
    for (const y of [280, 250, 220, 190, 160, 130, 100]) await finger.move(20, y);
    await finger.end();
  }
  await expect(date).toBeInViewport();
  await expect(cancel).toBeInViewport();
  await expect(save).toBeInViewport();
  expect((await center(handle)).y).toBeCloseTo(grabberY, 0);
});

test('the Tag picker owns horizontal swipes at its edge and the rail still changes legs', async ({ page }) => {
  const { sheet } = await openEntry(page);
  await sheet.getByRole('button', { name: 'Add leg', exact: true }).click();
  await sheet.getByRole('textbox', { name: 'Amount for leg 1' }).focus();
  const carousel = sheet.getByLabel('Entry legs');
  const picker = carousel.locator('.picker-row').first();
  const scrollLeft = (locator: Locator) => locator.evaluate(el => el.scrollLeft);
  await expect.poll(() => scrollLeft(carousel)).toBe(0);
  const { y } = await center(picker);
  const finger = await touch(page);
  async function swipeLeft() {
    await finger.start(290, y);
    for (const x of [260, 220, 180, 140, 100, 60]) await finger.move(x, y);
    await finger.end();
  }
  await swipeLeft();
  await swipeLeft();
  await expect.poll(() => picker.evaluate(el => el.scrollWidth - el.clientWidth - el.scrollLeft)).toBeLessThan(2);

  await swipeLeft();
  expect(await scrollLeft(carousel)).toBe(0);

  const labelY = (await center(sheet.getByText('Leg 1 of 2'))).y;
  await finger.start(250, labelY);
  for (const x of [215, 170, 130, 85, 45]) await finger.move(x, labelY);
  await finger.end();
  await expect.poll(() => scrollLeft(carousel)).toBeGreaterThan(150);
  await expect(sheet.getByText('Leg 2 of 2')).toBeInViewport();

  await sheet.getByRole('textbox', { name: 'Amount for leg 2' }).fill('137.82');
  await carousel.locator('.leg-card').nth(1).getByRole('button', { name: 'HOUSING', exact: true }).click();
  await sheet.getByRole('textbox', { name: 'Amount for leg 1' }).fill('83.51');
  await carousel.locator('.leg-card').first().getByRole('button', { name: 'MISC', exact: true }).click();
  await sheet.getByPlaceholder('e.g. lunch at canteen').fill('Split after swiping');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await page.getByRole('button', { name: 'Entries', exact: true }).click();
  const savedDay = page.locator('.date-group').filter({ hasText: 'Split after swiping' });
  await expect(savedDay).toContainText('83.51');
  await expect(savedDay).toContainText('137.82');
});

test('a smaller visual viewport keeps the focused field and header above the keyboard', async ({ page }) => {
  const { sheet } = await openEntry(page);
  const description = sheet.getByPlaceholder('e.g. lunch at canteen');
  await description.fill('Keep typing');
  const visibleHeight = 360;
  // Desktop Chromium does not open a software keyboard. Model its viewport resize.
  await page.evaluate(height => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: height });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  }, visibleHeight);
  await expect.poll(async () => {
    const box = (await sheet.boundingBox())!;
    return box.y + box.height;
  }).toBeLessThanOrEqual(visibleHeight);
  await expect(description).toBeFocused();
  const field = (await description.boundingBox())!;
  expect(field.y).toBeGreaterThan(0);
  expect(field.y + field.height).toBeLessThanOrEqual(visibleHeight);
  await expect(sheet.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport();
  await expect(sheet.getByRole('button', { name: 'Save', exact: true })).toBeInViewport();
});

test('reduced motion keeps direct tracking and lets a reversed pull settle open', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { sheet } = await openEntry(page);
  const { x, y } = await center(sheet.getByRole('heading'));
  const finger = await touch(page);
  await finger.start(x, y);
  await finger.move(x, y - 60);
  const resisted = await offset(sheet);
  expect(resisted).toBeLessThan(0);
  expect(resisted).toBeGreaterThan(-20);
  await finger.end();
  await expect.poll(() => offset(sheet)).toBe(0);

  await finger.start(x, y);
  await finger.move(x, y + 140);
  await expect.poll(() => offset(sheet)).toBeCloseTo(140, 0);
  await finger.move(x, y + 38);
  await finger.end();
  await expect.poll(() => offset(sheet)).toBe(0);
});
