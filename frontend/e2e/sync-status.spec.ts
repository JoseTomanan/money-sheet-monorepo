import { expect, test, type Page } from '@playwright/test';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

async function fakeSheet(page: Page) {
  const state = {
    write: null as ReturnType<typeof gate> | null,
    core: null as ReturnType<typeof gate> | null,
    stats: null as ReturnType<typeof gate> | null,
    failStats: false, failWrite: false,
    writes: [] as Record<string, unknown>[], reads: 0,
  };
  const entries: Record<string, unknown>[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('ms_connection', JSON.stringify({ gasUrl: 'https://status.example/exec', apiSecret: 'test' }));
    localStorage.setItem('ms_mock_dismissed', '1');
  });
  await page.route('https://status.example/**', async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      state.writes.push(body);
      if (state.failWrite) { await route.abort(); return; }
      await state.write?.promise;
      const legs = body.action === 'addEntries' ? body.entries : [body];
      const saved = legs.map((leg: Record<string, unknown>, index: number) => ({ ...leg, id: entries.length + index + 1, row: entries.length + index + 3, mainCategory: 'FOOD' }));
      entries.push(...saved);
      await route.fulfill({ json: body.action === 'addEntries' ? { entries: saved } : { entry: saved[0] } });
      return;
    }
    state.reads++;
    const action = new URL(request.url()).searchParams.get('action');
    if (action === 'getStats') {
      await state.stats?.promise;
      if (state.failStats) { await route.fulfill({ json: { error: 'Statistics unavailable' } }); return; }
    } else if (['getEntries', 'getMaster', 'getCategories'].includes(action!)) await state.core?.promise;
    await route.fulfill({ json: {
      getEntries: { entries }, getMaster: { master: { onHand: 100, budgets: { FOOD: 100 } } },
      getCategories: { categories: { FOOD: ['Dining'] } }, getConfig: { config: { currency: '$' } },
      getStats: { stats: { categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] } },
    }[action!] });
  });
  await page.goto('/');
  await expect(page.locator('.sync-status')).toHaveAttribute('data-sync-phase', 'ready');
  return state;
}

test('pastel status colors follow the existing semantic palette in both themes', async ({ page }) => {
  const network = await fakeSheet(page);
  const trigger = page.locator('.sync-status');
  const dot = page.locator('[data-sync-dot]');
  async function expectTint(token: string) {
    expect(await dot.evaluate((el, token) => {
      const reference = document.createElement('span');
      reference.style.backgroundColor = `color-mix(in srgb, rgb(var(${token})) 65%, white)`;
      document.body.append(reference);
      const matches = getComputedStyle(el).backgroundColor === getComputedStyle(reference).backgroundColor;
      reference.remove();
      return matches;
    }, token)).toBe(true);
  }
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme as 'light' | 'dark', reducedMotion: 'reduce' });
    await expect(trigger).toHaveAttribute('data-sync-phase', 'ready');
    await expectTint('--positive-rgb');
    network.core = gate();
    await trigger.click();
    await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
    await expect(trigger).toHaveAttribute('data-sync-phase', 'busy');
    await expectTint('--local-rgb');
    await page.context().setOffline(true);
    await expect(trigger).toHaveAttribute('data-sync-phase', 'waiting');
    await expectTint('--destructive-rgb');
    network.core.release(); network.core = null;
    await page.context().setOffline(false);
    await expect(trigger).toHaveAttribute('data-sync-phase', 'ready');
    await page.keyboard.press('Escape');
  }
});

for (const theme of ['light', 'dark'] as const) {
  for (const width of [320, 390, 1440]) {
    test(`status dot stays truthful and compact at ${width}px in ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'no-preference' });
      const network = await fakeSheet(page);
      await page.clock.install();
      const dot = page.locator('[data-sync-dot]');
      const trigger = page.locator('.sync-status');
      const initial = await trigger.boundingBox();
      expect(initial?.x).toBe(0);
      expect(initial?.y).toBe(0);
      expect(await trigger.evaluate(el => getComputedStyle(el).position)).toBe('fixed');
      for (const route of ['#/entries/2026-10-11', '#/summary', '#/summary/statistics', '#/home']) {
        await page.evaluate(route => { location.hash = route; }, route);
        await expect(trigger).toBeVisible();
        const rect = await trigger.boundingBox();
        expect(rect?.x).toBe(initial?.x);
        expect(rect?.y).toBe(initial?.y);
        await expect(page.getByRole('button', { name: 'Open settings' })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.locator('.scroll-area').evaluate(el => {
          el.style.height = '120px';
          el.scrollTop = el.scrollHeight;
        });
        expect(await trigger.boundingBox()).toEqual(initial);
        await page.locator('.scroll-area').evaluate(el => { el.style.height = ''; el.scrollTop = 0; });
      }
      expect((await dot.boundingBox())?.width).toBe(7);
      expect(await dot.evaluate(el => getComputedStyle(el).boxShadow)).not.toBe('none');
      expect(await dot.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
      network.write = gate(); network.core = gate(); network.stats = gate();
      await page.evaluate(async () => {
        const path = '/money-sheet-monorepo/src/lib/store.svelte.ts';
        const { store } = await import(path);
        store.submitAddEntry({ date: '2026-10-11', tag: 'Dining', description: 'Dot test', direction: 'O', amount: 10 });
      });
      await expect(trigger).toHaveAttribute('data-sync-phase', 'busy');
      await expect(trigger).toHaveAccessibleName(/1 pending change saved on this device/);
      expect(await dot.evaluate(el => getComputedStyle(el).animationName)).toBe('shimmer');
      await page.clock.fastForward(5_001);
      await expect(page.getByRole('region', { name: 'Notification' })).toHaveCount(0);
      expect(await page.locator('.hero-amount').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
      expect(await page.locator('.hero-amount').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      expect(await dot.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
      network.write.release();
      await expect(trigger).toHaveAccessibleName(/Confirmed in Sheets/);
      await page.clock.fastForward(5_001);
      await expect(trigger).toHaveAttribute('data-sync-phase', 'busy');
      await expect(page.getByRole('region', { name: 'Notification' })).toHaveCount(0);
      network.core.release(); network.core = null;
      await expect(page.getByText('Balances awaiting sync', { exact: true })).toHaveCount(0);
      await expect(trigger).toHaveAttribute('data-sync-phase', 'busy');
      network.failStats = true; network.stats.release(); network.stats = null;
      await expect(trigger).toHaveAttribute('data-sync-phase', 'waiting');
      await expect(trigger).toHaveAccessibleName(/Statistics unavailable/);
      expect(await dot.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
      await trigger.focus();
      await page.keyboard.press('Enter');
      await expect(trigger).toBeFocused();
      await expect(page.getByRole('region', { name: 'Sync details' })).toContainText('Statistics unavailable');
      await expect(page.getByRole('button', { name: 'Refresh data', exact: true })).toBeVisible();
      network.failStats = false;
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Refresh data', exact: true })).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(trigger).toHaveAttribute('data-sync-phase', 'ready');
      await expect(page.getByRole('button', { name: 'Refresh data', exact: true })).toBeFocused();
      // Recovery never dismisses a separately actionable error.
      await expect(page.getByRole('region', { name: 'Notification' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      await page.screenshot({ path: testInfo.outputPath(`dot-${theme}-${width}.png`), fullPage: true });
      await page.screenshot({ path: `../docs/pr/236/dot-${theme}-${width}.png`, fullPage: true });
      await page.context().setOffline(true);
      await expect(trigger).toHaveAttribute('data-sync-phase', 'waiting');
      await expect(trigger).toHaveAccessibleName(/Offline/);
      await page.context().setOffline(false);
      await expect(trigger).toHaveAttribute('data-sync-phase', 'ready');
      expect(network.writes).toHaveLength(1);
      expect(network.reads).toBeLessThanOrEqual(15);
      expect(await trigger.boundingBox()).toEqual(initial);
    });
  }
}


test('restored queued work retries from the dot with its original Mutation ID', async ({ page }) => {
  const network = await fakeSheet(page);
  network.failWrite = true;
  await page.evaluate(async () => {
    const path = '/money-sheet-monorepo/src/lib/store.svelte.ts';
    const { store } = await import(path);
    await store.submitAddEntry({ date: '2026-10-11', tag: 'Dining', description: 'Recoverable save', direction: 'O', amount: 10 }).completion;
  });
  const trigger = page.locator('.sync-status');
  await expect(trigger).toHaveAttribute('data-sync-phase', 'waiting');
  await expect(trigger).toHaveAccessibleName(/1 pending change saved on this device/);
  const original = network.writes[0];
  await page.reload();
  await expect.poll(() => network.writes.length).toBe(2);
  await expect(trigger).toHaveAttribute('data-sync-phase', 'waiting');
  await page.clock.install();
  await page.clock.fastForward(5_001);
  await expect(page.getByRole('region', { name: 'Notification' })).toHaveCount(0);
  network.failWrite = false; network.write = gate();
  await trigger.click();
  const retry = page.getByRole('button', { name: 'Sync now', exact: true });
  await retry.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => network.writes.length).toBe(3);
  network.write.release();
  await expect(trigger).toHaveAttribute('data-sync-phase', 'ready');
  expect(network.writes).toEqual([original, original, original]);
  await expect(page.getByRole('region', { name: 'Notification' })).toHaveCount(0);
});
