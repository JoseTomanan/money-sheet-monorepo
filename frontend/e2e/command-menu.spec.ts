import { expect, test, type Page } from './fixtures';

test.use({ hasTouch: true });

const menu = (page: Page) => page.getByRole('dialog', { name: 'Command menu', exact: true });
const opener = (page: Page) => page.getByRole('button', { name: 'Open command menu', exact: true });
async function ready(page: Page, route = '/#/home') {
  await page.goto(route);
  await expect(page.getByRole('button', { name: 'Add entry', exact: true })).toBeVisible();
}
async function choose(page: Page, label: string) {
  await opener(page).click();
  await menu(page).getByRole('option', { name: label, exact: true }).click();
  await expect(menu(page)).toHaveCount(0);
}

test('search, stable groups, disabled reasons, keyboard selection and sheet handoff', async ({ page }) => {
  await ready(page);
  await page.keyboard.press('Control+k');
  const palette = menu(page);
  const search = palette.getByRole('combobox');
  await expect(search).toBeFocused();
  await expect(palette.locator('[data-command-group-heading]')).toHaveText(['Actions', 'Navigation', 'Sync']);
  const redistribute = palette.getByRole('option', { name: 'Fund Redistribution', exact: true });
  await expect(redistribute).toHaveAttribute('aria-disabled', 'true');
  await expect(redistribute).toHaveAccessibleDescription('Go to Entries to redistribute funds.');
  await search.fill('TRANSFER');
  await expect(palette.getByRole('option')).toHaveCount(1);
  await redistribute.click({ force: true });
  await page.keyboard.press('Enter');
  await expect(palette).toBeVisible();
  await search.fill('no such command');
  await expect(palette.getByRole('status')).toHaveText('No commands found. Try another search.');
  await search.fill('');
  await page.keyboard.press('ArrowDown'); // skip disabled redistribution to Settings
  await page.keyboard.press('Enter');
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(settings).toBeVisible();
  await expect(settings.getByRole('button', { name: 'Done' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(opener(page)).toBeFocused();
  await page.keyboard.press('Control+k');
  await expect(search).toHaveValue('');
  await search.dispatchEvent('keydown', { key: 'Enter', repeat: true });
  await expect(palette).toBeVisible();
  await page.keyboard.press('Enter');
  const entry = page.locator('.sheet[data-state="open"]');
  await expect(entry.getByPlaceholder('0.00')).toBeFocused();
  await expect(palette).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(opener(page)).toBeFocused();
});

test('dismissal preserves week, filters, bulk selection; explicit navigation follows canonical week/history rules', async ({ page }) => {
  await ready(page, '/#/entries/2026-09-06');
  await page.getByRole('radio', { name: 'Outgoing', exact: true }).click();
  await page.getByRole('button', { name: 'Enter bulk-select mode' }).click();
  await page.keyboard.press('Control+a');
  const count = await page.locator('.select-bar').innerText();
  for (const dismiss of ['escape', 'close', 'outside']) {
    await opener(page).click();
    const add = menu(page).getByRole('option', { name: 'Add Entry', exact: true });
    await expect(add).toHaveAttribute('aria-disabled', 'true');
    await expect(add).toContainText('Exit bulk selection');
    if (dismiss === 'escape') await page.keyboard.press('Escape');
    if (dismiss === 'close') await menu(page).getByRole('button', { name: 'Close command menu' }).click();
    if (dismiss === 'outside') await page.mouse.click(2, 2);
    await expect(menu(page)).toHaveCount(0);
    await expect(opener(page)).toBeFocused();
    await expect(page).toHaveURL(/#\/entries\/2026-09-06$/);
    await expect(page.getByRole('radio', { name: 'Outgoing', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('.select-bar')).toHaveText(count);
  }
  const history = await page.evaluate(() => window.history.length);
  await choose(page, 'Entries');
  expect(await page.evaluate(() => window.history.length)).toBe(history);
  await expect(page.locator('.select-bar')).toHaveText(count);
  await page.locator('.tab-btn').evaluateAll(buttons => buttons.forEach(button => button.classList.remove('tab-btn')));
  await choose(page, 'Home');
  await expect(page).toHaveURL(/#\/home$/);
  await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeFocused();
  await choose(page, 'Entries');
  await expect(page).not.toHaveURL(/2026-09-06$/);
  await expect(page.getByRole('button', { name: 'Enter bulk-select mode' })).toBeVisible();
  await choose(page, 'Fund Redistribution');
  const redist = page.getByRole('dialog', { name: 'Redistribute Funds', exact: true });
  await expect(redist).toBeVisible();
  await expect(redist.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(opener(page)).toBeFocused();
});

test('typing, drafts, overlays and modifiers suppress opening; opt-out and cancelled G remain correct', async ({ page }) => {
  await ready(page);
  for (const modifiers of [{ ctrlKey: true, shiftKey: true }, { ctrlKey: true, altKey: true }, { metaKey: true }, { ctrlKey: true, repeat: true }, { ctrlKey: true, isComposing: true }]) {
    expect(await page.evaluate(modifiers => {
      const event = new KeyboardEvent('keydown', { key: 'k', bubbles: true, cancelable: true, ...modifiers });
      window.dispatchEvent(event); return event.defaultPrevented;
    }, modifiers)).toBe(false);
  }
  await page.evaluate(() => {
    const edit = document.createElement('div'); edit.contentEditable = 'true'; edit.textContent = 'Editable region'; document.body.append(edit); edit.focus();
  });
  await page.keyboard.press('Control+k');
  await expect(menu(page)).toHaveCount(0);
  await page.evaluate(() => document.querySelector('[contenteditable]')?.remove());
  await choose(page, 'Add Entry');
  const entry = page.locator('.sheet[data-state=open]');
  await entry.getByPlaceholder('0.00').fill('19+5');
  await page.keyboard.press('Control+k');
  await expect(entry.getByPlaceholder('0.00')).toHaveValue('19+5');
  await entry.getByRole('button', { name: 'Cancel', exact: true }).focus();
  await page.keyboard.press('Control+k');
  await expect(menu(page)).toHaveCount(0);
  await expect(entry.getByPlaceholder('0.00')).toHaveValue('24.00');
  await page.keyboard.press('Escape');
  await expect(page.locator('.sheet')).toHaveCount(0);
  await opener(page).focus();
  await page.keyboard.press('g'); await page.keyboard.press('Control+k'); await page.keyboard.press('Escape'); await page.keyboard.press('s');
  await expect(page).toHaveURL(/#\/home$/);
  await page.getByRole('button', { name: 'Keyboard shortcuts', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Ctrl+K');
  await page.getByRole('checkbox', { name: 'Enable character shortcuts' }).uncheck();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await opener(page).click();
  await expect(menu(page)).toBeVisible();
});

test('Mac binds only Cmd+K and exposes matching discovery', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }));
  await ready(page, '/#/summary/statistics');
  await expect(opener(page)).toHaveAttribute('title', /Cmd\+K/);
  await page.keyboard.press('Control+k'); await expect(menu(page)).toHaveCount(0);
  await page.keyboard.press('Meta+k'); await expect(menu(page)).toBeVisible();
  await expect(menu(page)).toContainText('Cmd+K');
  await page.keyboard.press('Escape');
  await expect(opener(page)).toBeFocused();
});

for (const width of [320, 1440]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`header, focus containment and palette fit ${width}px ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 760 });
      await page.emulateMedia({ colorScheme: theme });
      await ready(page);
      for (const route of ['#/home', '#/entries/2026-09-06', '#/summary', '#/summary/statistics']) {
        await page.evaluate(route => { location.hash = route; }, route);
        await expect(opener(page)).toBeInViewport();
        await expect(page.getByRole('button', { name: 'Keyboard shortcuts', exact: true })).toBeInViewport();
        await expect(page.getByRole('button', { name: 'Open settings', exact: true })).toBeInViewport();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await opener(page).tap();
      const palette = menu(page);
      const search = palette.getByRole('combobox');
      await expect(search).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(palette.getByRole('button', { name: 'Close command menu' })).toBeFocused();
      await page.keyboard.press('Tab'); await expect(search).toBeFocused();
      const selected = palette.locator('[data-command-item][data-selected]');
      await expect(selected).toHaveCount(1);
      expect(await selected.evaluate(el => getComputedStyle(el).boxShadow)).not.toBe('none');
      expect(await palette.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`commands-${width}-${theme}.png`) });
    });
  }
}

test('demo opening/search/dismissal sends no requests; Refresh demo remains explicit and ephemeral', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('script.google.com') || request.url().includes('example/exec')) requests.push(request.url()); });
  await ready(page);
  await opener(page).click();
  await menu(page).getByRole('combobox').fill('retry');
  await expect(menu(page).getByRole('option', { name: 'Refresh demo' })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(requests).toEqual([]);
  await choose(page, 'Refresh demo');
  await expect(page.locator('.sync-status')).toHaveAccessibleName(/Demo Mode/);
  expect(requests).toEqual([]);
});

test('Escape guards repeats and restores a surviving control if the opener disappears', async ({ page }) => {
  await ready(page);
  await opener(page).click();
  await menu(page).dispatchEvent('keydown', { key: 'Escape', repeat: true });
  await expect(menu(page)).toBeVisible();
  await menu(page).dispatchEvent('keydown', { key: 'Escape', isComposing: true });
  await expect(menu(page)).toBeVisible();
  await page.locator('.tab-btn').evaluateAll(buttons => buttons.forEach(button => button.classList.remove('tab-btn')));
  await opener(page).evaluate(el => el.remove());
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Home', exact: true })).toBeFocused();
});
