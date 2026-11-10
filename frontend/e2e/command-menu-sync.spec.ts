import { expect, test, type Page } from './fixtures';

const palette = (page: Page) => page.getByRole('dialog', { name: 'Command menu', exact: true });
const open = (page: Page) => page.getByRole('button', { name: 'Open command menu' }).click();
function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}

async function fakeSheet(page: Page, loading = false, demo = false) {
  const network = { reads: [] as string[], writes: [] as Record<string, unknown>[], failWrite: false, failRead: false,
    readGate: loading ? gate() : null as ReturnType<typeof gate> | null, writeGate: null as ReturnType<typeof gate> | null };
  const entries: Record<string, unknown>[] = [];
  await page.addInitScript(demo => {
    if (!demo) {
      localStorage.setItem('ms_connection', JSON.stringify({ gasUrl: 'https://commands.example/exec', apiSecret: 'test' }));
      localStorage.setItem('ms_mock_dismissed', '1');
    }
  }, demo);
  await page.route('https://commands.example/**', async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      const body = request.postDataJSON(); network.writes.push(body);
      if (network.failWrite) { await route.abort(); return; }
      await network.writeGate?.promise;
      const legs = body.action === 'addEntries' ? body.entries : [body];
      const saved = legs.map((leg: Record<string, unknown>, index: number) => ({ ...leg, id: entries.length + index + 1, row: entries.length + index + 3, mainCategory: 'FOOD' }));
      entries.push(...saved);
      await route.fulfill({ json: body.action === 'addEntries' ? { entries: saved } : { entry: saved[0] } });
    } else {
      const action = new URL(request.url()).searchParams.get('action')!;
      network.reads.push(action);
      await network.readGate?.promise;
      if (network.failRead) { await route.fulfill({ json: { error: 'Read unavailable' } }); return; }
      await route.fulfill({ json: {
        getEntries: { entries }, getMaster: { master: { onHand: 100, budgets: { FOOD: 100 } } },
        getCategories: { categories: { FOOD: ['Dining'] } }, getConfig: { config: { currency: '$' } },
        getStats: { stats: { categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] } },
      }[action] });
    }
  });
  await page.clock.setFixedTime(new Date('2026-11-08T12:00:00+08:00'));
  await page.goto('/#/entries/2026-11-08');
  if (!loading) await expect(page.locator('.sync-status')).toHaveAttribute('data-sync-phase', demo ? 'inactive' : 'ready');
  return network;
}

test('live availability changes and passive palette interactions issue no requests', async ({ page }) => {
  const network = await fakeSheet(page, true);
  await open(page);
  const add = palette(page).getByRole('option', { name: 'Add Entry', exact: true });
  const redist = palette(page).getByRole('option', { name: 'Fund Redistribution', exact: true });
  await expect(add).toHaveAttribute('aria-disabled', 'true');
  await expect(redist).toHaveAttribute('aria-disabled', 'true');
  await expect(palette(page).getByRole('option', { name: 'Refresh data' })).toHaveAttribute('aria-disabled', 'false');
  const reads = network.reads.length;
  await palette(page).getByRole('combobox').fill('NEW');
  await add.click({ force: true });
  await page.keyboard.press('Enter');
  await expect(palette(page)).toBeVisible();
  expect(network.reads.length).toBe(reads);
  network.readGate!.release(); network.readGate = null;
  await expect(add).toHaveAttribute('aria-disabled', 'false');
  await palette(page).getByRole('combobox').fill('');
  await expect(redist).toHaveAttribute('aria-disabled', 'false');
  await expect(page.locator('.sync-status')).toHaveAttribute('data-sync-phase', 'ready');
  await page.keyboard.press('Escape');
  expect(network.reads.length).toBe(reads);
  expect(network.writes).toEqual([]);
});

test('explicit ready and busy refreshes join existing reads, including forced metadata', async ({ page }) => {
  const network = await fakeSheet(page);
  const reads = network.reads.length;
  await open(page); await palette(page).getByRole('combobox').fill('refresh'); await page.keyboard.press('Escape');
  expect(network.reads.length).toBe(reads);
  network.readGate = gate();
  for (let i = 0; i < 2; i++) {
    await open(page);
    const action = palette(page).getByRole('option', { name: 'Refresh data' });
    await expect(action).toHaveAttribute('aria-disabled', 'false');
    await action.click();
    await expect(page.locator('.sync-status')).toHaveAttribute('data-sync-phase', 'busy');
  }
  await expect.poll(() => network.reads.length).toBe(reads + 5);
  for (const action of ['getEntries', 'getMaster', 'getStats', 'getCategories', 'getConfig']) {
    expect(network.reads.slice(reads).filter(read => read === action)).toHaveLength(1);
  }
  network.readGate.release(); network.readGate = null;
  await expect(page.locator('.sync-status')).toHaveAttribute('data-sync-phase', 'ready');
  expect(network.writes).toEqual([]);
});

test('waiting queued work retries the original Mutation ID and payload and busy activations join its owner', async ({ page }) => {
  const network = await fakeSheet(page);
  network.failWrite = true;
  await page.evaluate(async () => {
    const path = '/money-sheet-monorepo/src/lib/store.svelte.ts';
    const { store } = await import(path);
    store.submitAddEntry({ date: '2026-11-08', tag: 'Dining', description: 'Original queued intent', direction: 'O', amount: 17 });
  });
  await expect(page.locator('.sync-status')).toHaveAttribute('data-sync-phase', 'waiting');
  await expect(page.locator('[data-entry-row]')).toHaveAttribute('aria-disabled', 'true');
  await expect.poll(() => network.writes.length).toBe(1);
  const original = network.writes[0];
  expect(original.mutationId).toBeTruthy();
  network.failWrite = false; network.writeGate = gate();
  for (let i = 0; i < 2; i++) {
    await open(page);
    const action = palette(page).getByRole('option', { name: 'Sync now' });
    await expect(action).toHaveAttribute('aria-disabled', 'false');
    await action.click();
  }
  await expect.poll(() => network.writes.length).toBe(2);
  expect(network.writes[1]).toEqual(original);
  network.writeGate.release(); network.writeGate = null;
  await expect(page.locator('.sync-status')).toHaveAttribute('data-sync-phase', 'ready');
  await expect(page.locator('[data-entry-row]')).toHaveAttribute('aria-disabled', 'false');
  await open(page);
  await expect(palette(page).getByRole('option', { name: 'Refresh data' })).toBeVisible();
});

test('loading failure keeps Add unavailable and Settings available', async ({ page }) => {
  const network = await fakeSheet(page, true);
  network.failRead = true;
  network.readGate!.release(); network.readGate = null;
  await expect(page.locator('.error-card')).toBeVisible();
  await open(page);
  const add = palette(page).getByRole('option', { name: 'Add Entry', exact: true });
  await expect(add).toHaveAccessibleDescription('Resolve the data loading error first.');
  await add.click({ force: true });
  await expect(palette(page)).toBeVisible();
  await palette(page).getByRole('option', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Settings', exact: true })).toBeVisible();
  expect(network.writes).toEqual([]);
});

test('Connection changes invalidate open and already selected actions before dismissal completes', async ({ page }) => {
  const network = await fakeSheet(page);
  await open(page);
  const count = network.reads.length;
  // Same URL credential rotation creates a new lifetime. Change it in the same
  // event turn as selection, before the palette releases its focus scope.
  await page.evaluate(async () => {
    const path = '/money-sheet-monorepo/src/lib/connection.svelte.ts';
    const { setConnection } = await import(path);
    const option = document.querySelector<HTMLElement>('[data-command-item][data-value="sync"]')!;
    option.click();
    setConnection({ gasUrl: 'https://commands.example/exec', apiSecret: 'rotated' });
  });
  await expect(palette(page)).toHaveCount(0);
  // Connection's own initialization may read; the old palette may not force
  // metadata refresh. Its fresh, same-destination metadata remains reusable.
  await expect(page.locator('.sync-status')).toHaveAttribute('data-sync-phase', 'ready');
  expect(network.reads.slice(count).filter(action => action === 'getCategories' || action === 'getConfig')).toEqual([]);
  expect(network.writes).toEqual([]);
  await open(page);
  await page.evaluate(async () => {
    const path = '/money-sheet-monorepo/src/lib/connection.svelte.ts';
    const { setConnection } = await import(path);
    setConnection({ gasUrl: 'https://commands.example/other', apiSecret: 'new' });
  });
  await expect(palette(page)).toHaveCount(0);
});

test('entering a Connection invalidates a selected demo action before it can refresh the real destination', async ({ page }) => {
  const network = await fakeSheet(page, false, true);
  expect(network.reads).toEqual([]);
  await open(page);
  await expect(palette(page).getByRole('option', { name: 'Refresh demo' })).toBeVisible();
  await page.evaluate(async () => {
    const connectionPath = '/money-sheet-monorepo/src/lib/connection.svelte.ts';
    const storePath = '/money-sheet-monorepo/src/lib/store.svelte.ts';
    const { setConnection } = await import(connectionPath);
    const { store } = await import(storePath);
    const retry = store.retrySync;
    (window as any).obsoleteRetries = 0;
    store.retrySync = async () => { (window as any).obsoleteRetries++; await retry(); };
    document.querySelector<HTMLElement>('[data-command-item][data-value="sync"]')!.click();
    setConnection({ gasUrl: 'https://commands.example/exec', apiSecret: 'test' });
  });
  await expect(palette(page)).toHaveCount(0);
  await expect(page.locator('.sync-status')).toHaveAttribute('data-sync-phase', 'ready');
  expect(await page.evaluate(() => (window as any).obsoleteRetries)).toBe(0);
  expect(network.writes).toEqual([]);
});

test('no-Connection Settings gate preserves Ctrl+K and sends no data requests', async ({ page }) => {
  const requests: string[] = [];
  await page.addInitScript(() => localStorage.setItem('ms_mock_dismissed', '1'));
  page.on('request', request => { if (request.url().startsWith('https://')) requests.push(request.url()); });
  await page.goto('/');
  await expect(page.getByLabel(/GAS URL/)).toBeVisible();
  expect(await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(event); return event.defaultPrevented;
  })).toBe(false);
  await expect(page.getByRole('button', { name: 'Open command menu' })).toHaveCount(0);
  await expect(palette(page)).toHaveCount(0);
  expect(requests).toEqual([]);
});
