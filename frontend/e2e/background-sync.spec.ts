import { expect, test, type Page } from '@playwright/test';
import type { AddEntryPayload, Entry } from '../src/lib/types';

async function deferredNetwork(page: Page) {
  await page.goto('/');
  await expect(page.locator('.hero-amount')).toBeVisible();
  const snapshot = await page.evaluate(async () => {
    const path = '/money-sheet-monorepo/src/lib/store.svelte.ts';
    const { store } = await import(path);
    return { entries: JSON.parse(JSON.stringify(store.entries)), master: JSON.parse(JSON.stringify(store.master)), categories: JSON.parse(JSON.stringify(store.categories)), config: JSON.parse(JSON.stringify(store.config)), stats: JSON.parse(JSON.stringify(store.stats)) };
  });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let reads = 0;
  let writes = 0;
  await page.route('https://background-sync.example/**', async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      writes++;
      await held;
      const body = request.postDataJSON();
      const legs: AddEntryPayload[] = body.action === 'addEntries' ? body.entries : [body];
      const saved = legs.map((leg, index) => ({ ...leg, id: 90_000 + snapshot.entries.length + index, row: snapshot.entries.length + index + 3, mainCategory: 'FOOD' })) as Entry[];
      snapshot.entries.push(...saved);
      await route.fulfill({ json: body.action === 'addEntries' ? { entries: saved } : { entry: saved } });
    } else {
      reads++;
      const action = new URL(request.url()).searchParams.get('action');
      const key = { getEntries: 'entries', getMaster: 'master', getCategories: 'categories', getConfig: 'config', getStats: 'stats' }[action!]!;
      await route.fulfill({ json: { [key]: snapshot[key as keyof typeof snapshot] } });
    }
  });
  await page.evaluate(async () => {
    const apiPath = '/money-sheet-monorepo/src/lib/api.ts';
    const adapterPath = '/money-sheet-monorepo/src/lib/adapter-real.ts';
    const api = await import(apiPath);
    const { RealAdapter } = await import(adapterPath);
    api.setAdapter(new RealAdapter(() => ({ gasUrl: 'https://background-sync.example/exec', apiSecret: 'test' })));
  });
  return { release, reads: () => reads, writes: () => writes };
}

test('a confirmed Edit is actionable while its required read is still unresolved', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hero-amount')).toBeVisible();
  const id = await page.evaluate(async () => {
    const root = '/money-sheet-monorepo/src/lib/';
    const api = await import(root + 'api.ts');
    const { store } = await import(root + 'store.svelte.ts');
    const base = api.gateway();
    const entry = store.entries.at(-1)!;
    api.setAdapter({
      getEntries: () => new Promise(resolve => window.addEventListener('release-core', async () => resolve(await base.getEntries()), { once: true })),
      getMaster: () => base.getMaster(), getCategories: () => base.getCategories(),
      getConfig: () => base.getConfig(), getStats: () => base.getStats(),
      addEntry: (payload, key) => base.addEntry(payload, key), addEntries: (payloads, key) => base.addEntries(payloads, key),
      updateEntry: (id, patch) => base.updateEntry(id, patch), deleteEntry: id => base.deleteEntry(id),
      validateConnection: (url, secret) => base.validateConnection(url, secret),
    });
    store.submitUpdateEntry(entry.id, { description: 'Confirmed and actionable' });
    return entry.id;
  });
  await page.getByRole('button', { name: 'Entries', exact: true }).click();
  const row = page.locator('.entry-card', { hasText: 'Confirmed and actionable' });
  await expect(row).toHaveAttribute('aria-disabled', 'false');
  await row.click();
  await expect(page.locator('.sheet[data-state="open"]')).toBeVisible();
  await expect(page.locator('.field-input').first()).toHaveValue('Confirmed and actionable');
  const stillReconciling = await page.evaluate(async id => {
    const path = '/money-sheet-monorepo/src/lib/store.svelte.ts';
    const { store } = await import(path);
    return store.pendingIds.has(id) && !store.busyIds.has(id);
  }, id);
  expect(stillReconciling).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('release-core')));
});

for (const theme of ['light', 'dark'] as const) {
  for (const width of [320, 390, 1440]) {
    test(`deferred save stays quiet and usable at ${width}px in ${theme} theme`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
      const network = await deferredNetwork(page);
      await page.clock.install();
      await page.getByRole('button', { name: 'Entries', exact: true }).click();
      await page.getByRole('button', { name: 'Add entry', exact: true }).click();
      await page.locator('.amount-input').fill('25');
      await page.locator('.field-input').first().fill('Deferred lunch');
      await page.locator('.tag-pill', { hasText: 'FOOD' }).first().click();
      await page.locator('.tag-pill', { hasText: 'Dining' }).first().click();
      const admissionMs = await page.evaluate(async () => {
        const sveltePath = '/money-sheet-monorepo/node_modules/svelte/src/index-client.js';
        const { tick } = await import(sveltePath);
        const start = performance.now();
        (document.querySelector('button.header-btn.save') as HTMLButtonElement).click();
        await tick();
        return performance.now() - start;
      });
      expect(admissionMs).toBeLessThan(100);
      await expect(page.locator('.sheet[data-state="open"]')).toHaveCount(0);
      const row = page.locator('.entry-card', { hasText: 'Deferred lunch' });
      await expect(row).toBeVisible();
      await expect(row.locator('[data-local-indicator]')).toBeVisible();
      expect(await row.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
      await expect(page.getByRole('region', { name: 'Notification' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Home', exact: true }).click();
      await expect(page.getByText('Balances awaiting sync', { exact: true })).toBeVisible();
      expect(await page.locator('.hero-amount').evaluate(element => getComputedStyle(element).opacity)).toBe('1');
      await page.clock.fastForward(5_000);
      await expect(page.getByRole('region', { name: 'Notification' })).toHaveCount(0);
      await expect(page.locator('.sync-status')).toHaveAttribute('data-sync-phase', 'busy');
      await page.getByRole('button', { name: 'Summary', exact: true }).click();
      await page.screenshot({ path: testInfo.outputPath(`background-${theme}-${width}.png`), fullPage: true });
      await page.screenshot({ path: `../docs/pr/236/background-${theme}-${width}.png`, fullPage: true });
      const before = await page.locator('.scroll-area').evaluate(element => element.scrollTop);
      network.release();
      await expect(page.getByText('Balances awaiting sync', { exact: true })).toHaveCount(0);
      expect(await page.locator('.scroll-area').evaluate(element => element.scrollTop)).toBe(before);
      await expect(page.getByRole('region', { name: 'Notification' })).toHaveCount(0);
      expect(network.writes()).toBe(1);
      expect(network.reads()).toBeLessThanOrEqual(10);
      const sync = page.locator('.sync-status');
      await sync.focus();
      await expect(sync).toBeFocused();
      expect(await sync.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
}
