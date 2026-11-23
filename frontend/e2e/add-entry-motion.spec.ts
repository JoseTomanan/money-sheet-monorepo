import { expect, test, type Page } from './fixtures';

async function recordMotion(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener('transitionrun', (event) => {
      const element = event.target as HTMLElement;
      if (!element.matches('[data-entry-sheet-motion], [data-entry-overlay-motion]')) return;
      const surface = element.hasAttribute('data-entry-sheet-motion') ? 'sheet' : 'backdrop';
      const root = document.documentElement;
      root.dataset.entryTransitions += ` ${surface}:${element.dataset.state}:${event.propertyName}`;
    }, { capture: true });
  });
  await page.goto('/');
  await page.locator('html').evaluate(element => { element.dataset.entryTransitions = ''; });
}

test('pointer opening, Cancel, backdrop dismissal, and Save animate the Add Entry sheet', async ({ page }) => {
  await recordMotion(page);
  const add = page.getByRole('button', { name: 'Add entry', exact: true });
  const sheet = page.locator('[data-entry-sheet-motion]');
  const backdrop = page.locator('[data-entry-overlay-motion]');
  const log = page.locator('html');

  for (const close of [
    () => sheet.getByRole('button', { name: 'Cancel' }).click(),
    () => backdrop.click({ position: { x: 5, y: 5 } }),
    async () => {
      await sheet.getByPlaceholder('0.00').fill('42');
      await sheet.getByRole('button', { name: 'FOOD', exact: true }).click();
      await sheet.getByRole('button', { name: 'Save', exact: true }).click();
    },
  ]) {
    await log.evaluate(element => { element.dataset.entryTransitions = ''; });
    await add.click();
    await expect(log).toHaveAttribute('data-entry-transitions', /sheet:open:transform/);
    await expect(log).toHaveAttribute('data-entry-transitions', /backdrop:open:opacity/);
    await close();
    await expect(log).toHaveAttribute('data-entry-transitions', /sheet:closed:transform/);
    await expect(log).toHaveAttribute('data-entry-transitions', /backdrop:closed:opacity/);
    await expect(sheet).toHaveCount(0);
    await expect(add).toBeFocused();
  }
});

test('reduced motion fades the Add Entry sheet without moving it, and Escape closes immediately', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await recordMotion(page);
  const add = page.getByRole('button', { name: 'Add entry', exact: true });
  const sheet = page.locator('[data-entry-sheet-motion]');
  const log = page.locator('html');

  await add.click();
  await expect(log).toHaveAttribute('data-entry-transitions', /sheet:open:opacity/);
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(log).toHaveAttribute('data-entry-transitions', /sheet:closed:opacity/);
  await expect(sheet).toHaveCount(0);
  await expect(log).not.toHaveAttribute('data-entry-transitions', /transform/);

  await log.evaluate(element => { element.dataset.entryTransitions = ''; });
  await page.keyboard.press('Shift+N');
  await expect(sheet.getByPlaceholder('0.00')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(add).toBeFocused();
  await expect(log).toHaveAttribute('data-entry-transitions', '');
});

test('reopening during the exit cancels the dismissal and opens a fresh draft', async ({ page }) => {
  await recordMotion(page);
  const add = page.getByRole('button', { name: 'Add entry', exact: true });
  const sheet = page.locator('[data-entry-sheet-motion]');
  await add.click();
  await sheet.getByPlaceholder('0.00').fill('42');
  await sheet.evaluate(async element => {
    await Promise.all(element.getAnimations().map(animation => animation.finished));
  });
  await add.evaluate(element => {
    const cancel = document.querySelector<HTMLButtonElement>('[data-entry-cancel]')!;
    const click = () => new MouseEvent('click', { bubbles: true, detail: 1 });
    cancel.closest('.sheet')!.addEventListener('transitionrun', () => {
      element.dispatchEvent(click());
    }, { once: true });
    cancel.dispatchEvent(click());
  });
  await expect(page.locator('html')).toHaveAttribute('data-entry-transitions', /sheet:closed:transform/);
  await expect(sheet.getByPlaceholder('0.00')).toHaveValue('');
  await expect(sheet).toHaveAttribute('data-state', 'open');
  await expect(sheet.getByPlaceholder('0.00')).toBeFocused();
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(sheet).toHaveCount(0);
});

test('the command menu carries pointer activation through the focus handoff', async ({ page }) => {
  await recordMotion(page);
  await page.getByRole('button', { name: 'Open command menu' }).click();
  await page.getByRole('option', { name: 'Add Entry', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-entry-transitions', /sheet:open:transform/);
  await expect(page.locator('[data-entry-amount]')).toBeFocused();
});

test.describe('touch Add Entry', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('tap opens and closes with motion and keeps Amount unfocused', async ({ page }) => {
    await recordMotion(page);
    const add = page.getByRole('button', { name: 'Add entry', exact: true });
    const sheet = page.locator('[data-entry-sheet-motion]');
    const cancel = sheet.getByRole('button', { name: 'Cancel' });
    await add.tap();
    await expect(page.locator('html')).toHaveAttribute('data-entry-transitions', /sheet:open:transform/);
    await expect(cancel).toBeFocused();
    await cancel.tap();
    await expect(page.locator('html')).toHaveAttribute('data-entry-transitions', /sheet:closed:transform/);
    await expect(sheet).toHaveCount(0);
    await expect(add).toBeFocused();
  });
});
