import { expect, test, type Page } from '@playwright/test';

test.use({ hasTouch: true, timezoneId: 'Asia/Manila' });
const testTime = new Date('2026-10-27T12:00:00+08:00');

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
    statsError: 'Statistics unavailable',
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
      if (state.failStats) { await route.fulfill({ json: { error: state.statsError } }); return; }
    } else if (['getEntries', 'getMaster', 'getCategories'].includes(action!)) await state.core?.promise;
    await route.fulfill({ json: {
      getEntries: { entries }, getMaster: { master: { onHand: 100, budgets: { FOOD: 100 } } },
      getCategories: { categories: { FOOD: ['Dining'] } }, getConfig: { config: { currency: '$' } },
      getStats: { stats: { categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] } },
    }[action!] });
  });
  await page.clock.setFixedTime(testTime);
  await page.goto('/');
  await expect(page.locator('.sync-status')).toHaveAttribute('data-sync-phase', 'ready');
  return state;
}

test('status colors are strong, consistent and readable in both themes', async ({ page }) => {
  const network = await fakeSheet(page);
  const trigger = page.locator('.sync-status');
  const dot = page.locator('[data-sync-dot]');
  const dialog = page.getByRole('dialog', { name: 'Sync status', exact: true });
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
    const reads = network.reads;
    await trigger.click();
    await expect(dialog).toBeVisible();
    expect(network.reads).toBe(reads);
    async function expectColor(label: string, channel: number) {
      const heading = dialog.getByRole('heading', { name: label, exact: true });
      await expect(heading).toBeVisible();
      const colors = await heading.evaluate(el => {
        const rgb = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number);
        const luminance = (channels: number[]) => channels.map(c => {
          c /= 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
        const foreground = getComputedStyle(el).color;
        const background = getComputedStyle(el.closest('[role=dialog]')!).backgroundColor;
        const channels = rgb(foreground);
        const luminances = [luminance(channels), luminance(rgb(background))];
        return { foreground, channels, saturation: (Math.max(...channels) - Math.min(...channels)) / Math.max(...channels),
          contrast: (Math.max(...luminances) + 0.05) / (Math.min(...luminances) + 0.05) };
      });
      expect(colors.contrast).toBeGreaterThanOrEqual(4.5);
      expect(colors.saturation).toBeGreaterThan(0.5);
      expect(colors.channels[channel]).toBe(Math.max(...colors.channels));
      expect(await dot.evaluate(el => getComputedStyle(el).backgroundColor)).toBe(colors.foreground);
    }
    await expectColor('Up to date', 1);
    const shadow = await dot.evaluate(el => getComputedStyle(el).boxShadow);
    expect(shadow).not.toBe('none');
    const [alpha, , , blur] = shadow.match(/rgba\([^)]+, ([\d.]+)\) (-?[\d.]+)px (-?[\d.]+)px ([\d.]+)px/)!.slice(1).map(Number);
    expect(alpha).toBeLessThanOrEqual(0.08);
    expect(blur).toBeLessThanOrEqual(2);
    network.core = gate();
    await dialog.getByRole('button', { name: 'Refresh data', exact: true }).click();
    await expect(trigger).toHaveAttribute('data-sync-phase', 'busy');
    await expectColor('Syncing', 2);
    await page.context().setOffline(true);
    await expect(trigger).toHaveAttribute('data-sync-phase', 'waiting');
    await expectColor('Waiting to sync', 0);
    network.core.release(); network.core = null;
    await page.context().setOffline(false);
    await expect(trigger).toHaveAttribute('data-sync-phase', 'ready');
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    expect(network.writes).toHaveLength(0);
  }
});

for (const theme of ['light', 'dark'] as const) {
  for (const width of [320, 390, 1440]) {
    test(`status dot stays truthful and compact at ${width}px in ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'no-preference' });
      const network = await fakeSheet(page);
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
      const readsBeforeOpen = network.reads;
      await trigger.tap();
      const dialog = page.getByRole('dialog', { name: 'Sync status', exact: true });
      const close = dialog.getByRole('button', { name: 'Close sync status' });
      const refresh = dialog.getByRole('button', { name: 'Refresh data', exact: true });
      await expect(dialog).toBeVisible();
      await expect(close).toBeFocused();
      await page.screenshot({ path: `../docs/pr/259/ready-${theme}-${width}.png`, fullPage: true });
      await close.click();
      await expect(trigger).toBeFocused();
      expect(network.reads).toBe(readsBeforeOpen);
      await page.clock.install({ time: testTime });
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
      await trigger.focus();
      await page.keyboard.press('Enter');
      await expect(close).toBeFocused();
      await expect(dialog).toContainText('1 pending change saved on this device; not yet confirmed in Sheets.');
      network.write.release();
      await expect(trigger).toHaveAccessibleName(/Confirmed in Sheets/);
      await expect(dialog).toContainText('Confirmed in Sheets; updating balances and statistics.');
      await expect(close).toBeFocused();
      await page.clock.fastForward(5_001);
      await expect(trigger).toHaveAttribute('data-sync-phase', 'busy');
      await expect(page.getByRole('region', { name: 'Notification' })).toHaveCount(0);
      network.core.release(); network.core = null;
      await expect(page.getByText('Balances awaiting sync', { exact: true })).toHaveCount(0);
      await expect(trigger).toHaveAttribute('data-sync-phase', 'busy');
      network.statsError = 'Statistics unavailable. ' + 'FailedRequest/'.repeat(24) + ' Try refreshing again.';
      network.failStats = true; network.stats.release(); network.stats = null;
      await expect(trigger).toHaveAttribute('data-sync-phase', 'waiting');
      await expect(trigger).toHaveAccessibleName(/Statistics unavailable/);
      expect(await dot.evaluate(el => getComputedStyle(el).animationName)).toBe('none');
      await expect(close).toBeFocused();
      await expect(dialog).toContainText(network.statsError);
      await expect(dialog.getByRole('heading', { name: 'Waiting to sync' })).toBeVisible();
      expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `../docs/pr/259/waiting-${theme}-${width}.png`, fullPage: true });
      await expect(page.getByRole('button', { name: 'Refresh data', exact: true })).toBeVisible();
      network.failStats = false;
      // Transport failures live in status details. Seed a separate actionable
      // error so this assertion actually verifies recovery leaves it alone.
      await page.evaluate(async () => {
        const path = '/money-sheet-monorepo/src/lib/toast.svelte.ts';
        const { toast } = await import(path);
        toast.show('Another operation was rejected', undefined, 'destructive');
      });
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Refresh data', exact: true })).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(close).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(refresh).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(trigger).toHaveAttribute('data-sync-phase', 'ready');
      await expect(dialog.getByRole('heading', { name: 'Up to date', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Refresh data', exact: true })).toBeFocused();
      // Recovery never dismisses a separately actionable error.
      await expect(page.getByRole('region', { name: 'Notification' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      await page.screenshot({ path: testInfo.outputPath(`dot-${theme}-${width}.png`), fullPage: true });

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

for (const theme of ['light', 'dark'] as const) {
  test(`inactive demo status stays truthful and can refresh without network in ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    const requests: string[] = [];
    await page.route('https://**', async route => { requests.push(route.request().url()); await route.abort(); });
    await page.goto('/');
    const trigger = page.locator('.sync-status');
    await expect(trigger).toHaveAttribute('data-sync-phase', 'inactive');
    await trigger.tap();
    const dialog = page.getByRole('dialog', { name: 'Sync status', exact: true });
    const heading = dialog.getByRole('heading', { name: 'Sync inactive' });
    await expect(heading).toBeVisible();
    await expect(dialog).toContainText('Demo Mode. No spreadsheet is connected; changes last for this session.');
    expect(await heading.evaluate(el => getComputedStyle(el).color)).toBe(
      await page.locator('[data-sync-dot]').evaluate(el => getComputedStyle(el).backgroundColor));
    await dialog.getByRole('button', { name: 'Refresh demo', exact: true }).click();
    await expect(trigger).toHaveAttribute('data-sync-phase', 'inactive');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Refresh demo', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await page.getByRole('button', { name: 'Exit', exact: true }).click();
    await expect(page.getByText('Connect your spreadsheet', { exact: true })).toBeVisible();
    await expect(page.locator('.sync-status')).toHaveCount(0);
    expect(requests).toHaveLength(0);
  });
}
