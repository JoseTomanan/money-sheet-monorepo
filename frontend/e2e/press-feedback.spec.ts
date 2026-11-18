import { test, expect } from './fixtures';

test('pointer press gives direction feedback and releases when the pointer leaves', async ({ page }) => {
  await page.goto('/#/entries/');
  await page.getByRole('button', { name: 'Add entry', exact: true }).click();
  const button = page.getByRole('button', { name: 'Incoming', exact: true });
  await button.hover();
  const box = (await button.boundingBox())!;
  await page.mouse.down();
  await expect.poll(() => button.evaluate(el => getComputedStyle(el).transform)).not.toBe('none');
  await page.mouse.move(box.x - 10, box.y - 10);
  await expect.poll(() => button.evaluate(el => getComputedStyle(el).transform)).toBe('none');
  await page.mouse.up();
});

test('reduced motion uses opacity for pointer feedback while keyboard activation stays still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/entries/');
  await page.getByRole('button', { name: 'Add entry', exact: true }).click();
  const sheet = page.locator('.sheet[data-state="open"]');
  const button = sheet.getByRole('button', { name: 'Incoming', exact: true });
  await button.hover();
  await page.mouse.down();
  await expect.poll(() => button.evaluate(el => Number(getComputedStyle(el).opacity))).toBeLessThan(0.99);
  expect(await button.evaluate(el => getComputedStyle(el).transform)).toBe('none');
  await page.mouse.up();
  await expect.poll(() => button.evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1);
  await button.focus();
  await page.keyboard.down('Space');
  expect(await button.evaluate(el => getComputedStyle(el).opacity)).toBe('1');
  await page.keyboard.up('Space');
  await expect(sheet.getByPlaceholder('0.00').first()).toBeVisible();
});

test('disabled Save stays unchanged and Add leg retains focus behavior', async ({ page }) => {
  await page.goto('/#/entries/');
  await page.getByRole('button', { name: 'Add entry', exact: true }).click();
  const sheet = page.locator('.sheet[data-state="open"]');
  const save = sheet.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeDisabled();
  await save.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true, button: 0 });
  expect(await save.evaluate(el => getComputedStyle(el).transform)).toBe('none');
  expect(await save.evaluate(el => getComputedStyle(el).opacity)).toBe('0.4');
  await sheet.getByRole('button', { name: 'Add leg', exact: true }).click();
  await expect(sheet.getByPlaceholder('0.00').nth(1)).toBeFocused();
});

test('touch cancellation clears feedback and enabled Save responds to a pointer press', async ({ page }) => {
  await page.goto('/#/entries/');
  await page.getByRole('button', { name: 'Add entry', exact: true }).click();
  const sheet = page.locator('.sheet[data-state="open"]');
  const add = sheet.getByRole('button', { name: 'Add leg', exact: true });
  await add.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0 });
  await expect.poll(() => add.evaluate(el => getComputedStyle(el).transform)).not.toBe('none');
  await add.dispatchEvent('pointercancel', { pointerId: 7, pointerType: 'touch', isPrimary: true });
  await expect.poll(() => add.evaluate(el => getComputedStyle(el).transform)).toBe('none');
  await sheet.getByPlaceholder('0.00').first().fill('42');
  await sheet.getByRole('button', { name: 'FOOD', exact: true }).click();
  const save = sheet.getByRole('button', { name: 'Save', exact: true });
  await expect(save).toBeEnabled();
  await save.hover();
  await page.mouse.down();
  await expect.poll(() => save.evaluate(el => getComputedStyle(el).transform)).not.toBe('none');
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await expect.poll(() => save.evaluate(el => getComputedStyle(el).transform)).toBe('none');
  await expect(sheet).toBeVisible();
});
