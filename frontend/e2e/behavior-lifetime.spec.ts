import { expect, test, type Page } from './fixtures';
import type { Entry } from '../src/lib/types';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

async function destination(page: Page) {
  const network = { reads: [] as string[], writes: [] as Record<string, any>[], hold: gate(), fail: false };
  const entries: Entry[] = [{ id: 1, row: 3, date: '2026-11-08', tag: 'Dining', mainCategory: 'FOOD', direction: 'O', description: 'Confirmed lunch', amount: 10 }];
  await page.clock.setFixedTime(new Date('2026-11-10T12:00:00+08:00'));
  await page.addInitScript(() => {
    localStorage.setItem('ms_connection', JSON.stringify({ gasUrl: 'https://behavior.example/exec', apiSecret: 'test' }));
    localStorage.setItem('ms_mock_dismissed', '1');
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    const online = new Set<EventListenerOrEventListenerObject>();
    const counts = { added: 0, removed: 0, active: 0 };
    Object.assign(window, { onlineOwners: counts });
    window.addEventListener = ((type, listener, options) => {
      if (type === 'online') { online.add(listener); counts.added++; counts.active = online.size; }
      return add(type, listener, options);
    }) as typeof window.addEventListener;
    window.removeEventListener = ((type, listener, options) => {
      if (type === 'online') { online.delete(listener); counts.removed++; counts.active = online.size; }
      return remove(type, listener, options);
    }) as typeof window.removeEventListener;
  });
  await page.route('https://behavior.example/**', async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      network.writes.push(body);
      await network.hold.promise;
      if (network.fail) { await route.abort(); return; }
      const legs = body.action === 'addEntries' ? body.entries : [body];
      const saved = legs.map((leg: Entry, i: number) => ({ ...leg, id: entries.length + i + 1, row: entries.length + i + 3, mainCategory: leg.tag === 'FINANCE' ? 'FINANCE' : 'FOOD' }));
      entries.push(...saved);
      await route.fulfill({ json: body.action === 'addEntries' ? { entries: saved } : { entry: saved[0] } });
    } else {
      const action = new URL(request.url()).searchParams.get('action')!;
      network.reads.push(action);
      await route.fulfill({ json: {
        getEntries: { entries }, getMaster: { master: { onHand: 100, budgets: { FOOD: 100, FINANCE: 50 } } },
        getCategories: { categories: { FOOD: ['Dining'], FINANCE: ['Savings'] } }, getConfig: { config: { currency: '$' } },
        getStats: { stats: { categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] } },
      }[action] });
    }
  });
  await page.goto('/#/entries/2026-11-08');
  await expect(page.locator('.sync-status')).toHaveAttribute('data-sync-phase', 'ready');
  return network;
}

test('responsive navigation retains one initialization/replay owner and frozen row activation policy after editor dismissal', async ({ page }) => {
  const network = await destination(page);
  expect(network.reads.filter(action => action === 'getEntries')).toHaveLength(1);
  await page.getByRole('button', { name: 'Add entry', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'New Outgoing', exact: true });
  await editor.getByRole('button', { name: 'FOOD', exact: true }).click();
  await editor.getByPlaceholder('0.00').fill('17');
  await editor.getByPlaceholder('e.g. lunch at canteen').fill('Admitted while responsive');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect.poll(() => network.writes.length).toBe(1);
  const original = network.writes[0];
  for (const width of [320, 1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Summary', exact: true }).click();
    await page.goBack();
    await expect(page).toHaveURL(/#\/home$/);
    await page.getByRole('button', { name: 'Entries', exact: true }).click();
    await expect(page).toHaveURL(/#\/entries\/2026-11-08$/);
  }
  expect(network.reads.filter(action => action === 'getEntries')).toHaveLength(1);
  expect(await page.evaluate(() => (window as any).onlineOwners)).toEqual({ added: 1, removed: 0, active: 1 });
  network.fail = true;
  network.hold.release();
  await expect(page.locator('.sync-status')).toHaveAttribute('data-sync-phase', 'waiting');
  const frozen = page.locator('[data-entry-row]').filter({ hasText: 'Admitted while responsive' });
  await expect(frozen).toHaveAttribute('aria-disabled', 'true');
  await frozen.dispatchEvent('click');
  await frozen.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Enter bulk-select mode' }).click();
  await frozen.dispatchEvent('click');
  await frozen.focus(); await page.keyboard.press('Space');
  await expect(page.getByText('0 selected', { exact: true })).toBeVisible();
  const confirmed = page.locator('[data-entry-row]').filter({ hasText: 'Confirmed lunch' });
  await confirmed.focus(); await page.keyboard.press('Enter');
  await expect(page.getByText('1 selected', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await confirmed.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Edit Outgoing', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  network.fail = false; network.hold = gate();
  await page.evaluate(() => { for (let i = 0; i < 3; i++) window.dispatchEvent(new Event('online')); });
  await expect.poll(() => network.writes.length).toBe(2);
  expect(network.writes[1]).toEqual(original);
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await page.evaluate(() => (window as any).onlineOwners)).toEqual({ added: 1, removed: 0, active: 1 });
  network.hold.release();
  await expect(page.locator('.sync-status')).toHaveAttribute('data-sync-phase', 'ready');
  await expect(frozen).toHaveAttribute('aria-disabled', 'false');
  expect(network.writes).toHaveLength(2);
  expect(network.reads.filter(action => action === 'getEntries')).toHaveLength(2);
});

test('Redistribution admits one atomic ordered batch and dismisses before delivery', async ({ page }) => {
  const network = await destination(page);
  await page.getByRole('button', { name: 'Redistribute', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Redistribute Funds', exact: true });
  await sheet.getByRole('button', { name: 'FOOD', exact: true }).first().click();
  await sheet.getByRole('button', { name: 'FINANCE', exact: true }).last().click();
  await sheet.getByPlaceholder('0.00').fill('100-30');
  await sheet.getByRole('button', { name: 'Redistribute', exact: true }).dispatchEvent('click');
  await expect(sheet).toHaveCount(0);
  await expect.poll(() => network.writes.length).toBe(1);
  expect(network.writes[0]).toMatchObject({ action: 'addEntries', entries: [
    { tag: 'FOOD', amount: -70, direction: 'I', description: '[REDISTRIBUTE]' },
    { tag: 'FINANCE', amount: 70, direction: 'I', description: '[REDISTRIBUTE]' },
  ] });
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  network.hold.release();
  await expect(page.locator('.sync-status')).toHaveAttribute('data-sync-phase', 'ready');
  expect(network.writes).toHaveLength(1);
});
