import { expect, test, type Page } from './fixtures';

async function waitForAppReady(page: Page) {
  await page.locator('.app-shell').waitFor({ state: 'visible' });
  await page.locator('.loading-spinner').waitFor({ state: 'detached' });
}

test('direct canonical hash routes render their matching views', async ({ page }) => {
  await page.goto('/#/summary');
  await waitForAppReady(page);
  await expect(page.getByText('Funds health')).toBeVisible();

  await page.goto('/#/entries/2025-01-05');
  await waitForAppReady(page);
  await expect(page.locator('[data-week-trigger]')).toContainText(/jan 5/i);
  await expect(page).toHaveURL(/#\/entries\/2025-01-05$/);
});

test('UI route navigation updates the hash and browser Back restores the prior view', async ({ page }) => {
  await page.goto('/#/summary');
  await waitForAppReady(page);

  await page.getByRole('button', { name: 'Deeper statistics' }).click();
  await expect(page).toHaveURL(/#\/summary\/statistics$/);
  await expect(page.getByText('Deeper stats')).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#\/summary$/);
  await expect(page.getByText('Funds health')).toBeVisible();

  await page.getByRole('button', { name: 'Entries', exact: true }).click();
  await expect(page).toHaveURL(/#\/entries\/\d{4}-\d{2}-\d{2}$/);
});

test('browser Back restores the prior route scroll position', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 400 });
  await page.goto('/#/home');
  await waitForAppReady(page);
  const scrollArea = page.locator('.scroll-area');
  await scrollArea.evaluate((element) => {
    element.scrollTop = 120;
    element.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(() => scrollArea.evaluate((element) => element.scrollTop)).toBe(120);

  await page.getByRole('button', { name: 'Summary' }).click();
  await expect.poll(() => scrollArea.evaluate((element) => element.scrollTop)).toBe(0);

  await page.goBack();
  await expect(page).toHaveURL(/#\/home$/);
  await expect.poll(() => scrollArea.evaluate((element) => element.scrollTop)).toBe(120);
});

test('late movement of the Entries scroller cannot move Home', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 400 });
  await page.goto('/#/entries/2025-01-05');
  await waitForAppReady(page);
  await page.evaluate(async () => {
    const root = '/money-sheet-monorepo/src/lib/';
    const { gateway } = await import(root + 'api.ts');
    const { store } = await import(root + 'store.svelte.ts');
    for (let i = 0; i < 20; i++) {
      await gateway().addEntry({ date: '2025-01-05', tag: 'FOOD', description: `Test ${i}`, direction: 'I', amount: 1 });
    }
    await store.refreshAll();
  });
  await page.locator('.scroll-area').evaluate(el => {
    el.scrollTop = 120;
    el.dispatchEvent(new Event('scroll'));
    (window as unknown as { outgoing: Element }).outgoing = el;
  });
  await expect.poll(() => page.locator('.scroll-area').evaluate(el => el.scrollTop)).toBe(120);
  await page.evaluate(() => {
    const samples: Array<{ offset: number; header: boolean; balance: boolean }> = [];
    (window as unknown as { samples: typeof samples }).samples = samples;
    const sample = () => {
      const scroller = document.querySelector<HTMLElement>('.scroll-area');
      const hero = scroller?.querySelector('.hero-amount');
      const header = scroller?.querySelector('.page-header');
      if (scroller && hero && header && location.hash === '#/home') {
        const area = scroller.getBoundingClientRect();
        const visible = (el: Element) => {
          const rect = el.getBoundingClientRect();
          return rect.bottom > Math.max(0, area.top) && rect.top < Math.min(innerHeight, area.bottom);
        };
        samples.push({ offset: scroller.scrollTop, header: visible(header), balance: visible(hero) });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.evaluate(() => {
    (document.querySelector('[data-app-navigation="home"]') as HTMLButtonElement).click();
    const outgoing = (window as unknown as { outgoing: HTMLElement }).outgoing;
    outgoing.scrollTop = 140;
    outgoing.dispatchEvent(new Event('scroll'));
  });
  await expect(page.locator('.hero-amount')).toBeVisible();
  for (const offset of [80, 300]) {
  await page.evaluate(offset => {
    const outgoing = (window as unknown as { outgoing: HTMLElement }).outgoing;
    outgoing.scrollTop = offset;
    outgoing.dispatchEvent(new Event('scroll'));
  }, offset);
  expect(await page.locator('.scroll-area').evaluate(el => el.scrollTop)).toBe(0);
  for (const selector of ['.page-header', '.hero-amount']) {
    expect(await page.locator(selector).evaluate(el => {
      const content = el.closest('.scroll-area')!.getBoundingClientRect();
      const bounds = el.getBoundingClientRect();
      return bounds.bottom > Math.max(0, content.top) && bounds.top < Math.min(innerHeight, content.bottom);
    })).toBe(true);
  }
  }
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const samples = await page.evaluate(() => (window as unknown as { samples: Array<{ offset: number; header: boolean; balance: boolean }> }).samples);
  expect(samples.length).toBeGreaterThan(0);
  expect(samples.every(sample => sample.offset === 0 && sample.header && sample.balance)).toBe(true);
  await page.goBack();
  await expect(page).toHaveURL(/#\/entries\/2025-01-05$/);
  await expect.poll(() => page.locator('.scroll-area').evaluate(el => el.scrollTop)).toBe(120);
  await page.goForward();
  await expect.poll(() => page.locator('.scroll-area').evaluate(el => el.scrollTop)).toBe(0);
  if (testInfo.project.name === 'webkit') {
    await page.locator('.scroll-area').evaluate(el => { el.scrollTop = 90; el.dispatchEvent(new Event('scroll')); });
  } else {
    await page.mouse.move(200, 200);
    await page.mouse.wheel(0, 90);
  }
  await expect.poll(() => page.locator('.scroll-area').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  const homeOffset = await page.locator('.scroll-area').evaluate(el => el.scrollTop);
  await page.goBack();
  await page.goForward();
  await expect.poll(() => page.locator('.scroll-area').evaluate(el => el.scrollTop)).toBe(homeOffset);
  await page.getByRole('button', { name: 'Entries', exact: true }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect.poll(() => page.locator('.scroll-area').evaluate(el => el.scrollTop)).toBe(0);
});
