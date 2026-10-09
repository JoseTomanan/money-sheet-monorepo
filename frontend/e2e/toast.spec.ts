import { expect, test, type Page } from '@playwright/test';

const body = 'Not updated: entries, balances, categories, settings, statistics.';

async function failRefresh(page: Page) {
  await page.route('https://toast-api.example/**', route => route.abort('failed'));
  await page.goto('/');
  await expect(page.locator('.app-shell')).toBeVisible();
  await expect(page.locator('.loading-spinner')).toHaveCount(0);
  // Exercise the real request/error boundary against an intercepted dummy URL,
  // even when the shared dev server is in Mock Mode.
  await page.evaluate(async () => {
    const root = '/money-sheet-monorepo/src/lib/';
    const { setAdapter } = await import(root + 'api.ts');
    const { RealAdapter } = await import(root + 'adapter-real.ts');
    const { store } = await import(root + 'store.svelte.ts');
    setAdapter(new RealAdapter(() => ({ gasUrl: 'https://toast-api.example/exec', apiSecret: 'dummy' })));
    await store.refreshAll(true);
  });
  await expect(page.getByRole('region', { name: 'Notification' })).toContainText(body);
}

for (const width of [320, 390, 768, 1280]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`five-resource failure fits ${width}px in ${theme} theme`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(theme => localStorage.setItem('theme-preference', theme), theme);
      await failRefresh(page);
      const card = page.getByRole('region', { name: 'Notification' });
      await card.hover();
      await expect(card.getByRole('heading')).toHaveText("Couldn't refresh your data");
      await expect(card).not.toContainText('Network error');
      const box = (await card.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(16);
      expect(box.x + box.width).toBeLessThanOrEqual(width - 16);
      expect(box.width).toBeLessThanOrEqual(420);
      const navigation = (await page.locator('.tab-bar-pill').boundingBox())!;
      expect(box.y + box.height).toBeLessThan(navigation.y);
      expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      const contrast = await card.evaluate(el => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d')!;
        function rgba(color: string) {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          return Array.from(ctx.getImageData(0, 0, 1, 1).data);
        }
        function luminance(rgb: number[]) {
          const linear = rgb.slice(0, 3).map(value => {
            const v = value / 255;
            return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
          });
          return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
        }
        const surface = rgba(getComputedStyle(el).backgroundColor);
        return [...el.querySelectorAll('p, h2, button')].map(child => {
          const css = getComputedStyle(child);
          const background = rgba(css.backgroundColor);
          const alpha = background[3] / 255;
          const bg = background.map((v, i) => v * alpha + surface[i] * (1 - alpha));
          const a = luminance(rgba(css.color));
          const b = luminance(bg);
          return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        });
      });
      contrast.forEach(ratio => expect(ratio).toBeGreaterThanOrEqual(4.5));
      for (const name of ['Retry', 'Check Settings', 'Dismiss']) {
        const control = (await card.getByRole('button', { name }).boundingBox())!;
        expect(control.height).toBeGreaterThanOrEqual(44);
        expect(control.width).toBeGreaterThanOrEqual(44);
        expect(control.x + control.width).toBeLessThanOrEqual(box.x + box.width);
      }
      await testInfo.attach(`failure-${theme}-${width}`, { body: await page.screenshot(), contentType: 'image/png' });
      if (width === 390 || width === 1280) {
        await page.screenshot({ path: `../docs/pr/213/failure-${theme}-${width}.png` });
      }
    });
  }
}

test('hover and keyboard focus pause expiry, Retry runs once and restarts the clock', async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  let reads = 0;
  page.on('request', request => { if (request.url().startsWith('https://toast-api.example/')) reads++; });
  await failRefresh(page);
  const card = page.getByRole('region', { name: 'Notification' });
  await page.clock.runFor(2000);
  await card.hover();
  await card.getByRole('button', { name: 'Retry' }).focus();
  await page.clock.runFor(10000);
  await page.mouse.move(0, 0);
  await page.clock.runFor(10000);
  await expect(card).toBeVisible();
  const retry = card.getByRole('button', { name: 'Retry' });
  await expect(retry).toBeFocused();
  expect(await retry.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await retry.press('Enter');
  await expect.poll(() => reads).toBe(10);
  await expect(card).toContainText(body);
  // The reappearing notification does not take focus.
  await page.mouse.move(0, 0);
  await page.clock.runFor(7999);
  await expect(card).toBeVisible();
  await page.clock.runFor(1);
  await expect(card).toHaveCount(0);
  expect(reads).toBe(10);
});

test('Check Settings retains navigation and notification stays visible over an open sheet', async ({ page }) => {
  await failRefresh(page);
  const card = page.getByRole('region', { name: 'Notification' });
  await card.getByRole('button', { name: 'Check Settings' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(card).toBeVisible();
  const layers = await card.evaluate(el => {
    const box = el.getBoundingClientRect();
    return document.elementsFromPoint(box.x + box.width / 2, box.y + 10).some(top => top === el || el.contains(top));
  });
  expect(layers).toBe(true);
  await card.getByRole('button', { name: 'Dismiss' }).click();
  await expect(card).toHaveCount(0);
});

test('document visibility pauses expiry and resumes only the remaining visible time', async ({ page }) => {
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await failRefresh(page);
  const card = page.getByRole('region', { name: 'Notification' });
  await page.clock.runFor(2000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(20000);
  await expect(card).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(5999);
  await expect(card).toBeVisible();
  await page.clock.runFor(1);
  await expect(card).toHaveCount(0);
});

test('long messages wrap at 200% text size and reduced motion removes the entrance', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await failRefresh(page);
  await page.evaluate(async () => {
    const root = '/money-sheet-monorepo/src/lib/';
    const { toast } = await import(root + 'toast.svelte.ts');
    toast.show('A very long notification with an unbroken diagnostic ' + 'x'.repeat(150), { label: 'Retry', run() {} }, 'destructive');
  });
  const card = page.getByRole('region', { name: 'Notification' });
  await card.evaluate(el => { (el as HTMLElement).style.zoom = '2'; });
  // CSS zoom changes the effective layout viewport for the fixed card.
  const box = (await card.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await card.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
});
