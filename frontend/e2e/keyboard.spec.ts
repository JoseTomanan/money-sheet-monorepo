import { expect, test, type Page } from './fixtures';

async function ready(page: Page, route = '/#/entries/') {
  await page.goto(route);
  await expect(page.getByRole('button', { name: 'Add entry', exact: true })).toBeVisible();
}

test('keyboard-only Split Entry traverses grouped choices, adds a leg, and saves unblurred arithmetic', async ({ page }) => {
  await ready(page);
  await page.keyboard.press('Shift+N');
  const sheet = page.locator('.sheet[data-state="open"]');
  const amounts = sheet.getByPlaceholder('0.00');
  await expect(amounts.first()).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(sheet.getByRole('button', { name: 'Incoming', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.type('100-30');
  await page.keyboard.press('Tab');
  await expect(sheet.getByRole('button', { name: 'HOUSING', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(sheet.getByRole('button', { name: 'FOOD', exact: true })).toBeFocused();
  await expect(sheet.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await page.keyboard.press('Enter');
  await expect(sheet.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  await page.keyboard.press('Tab');
  await expect(sheet.getByRole('button', { name: 'Groceries', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await page.keyboard.press('Tab');
  await expect(sheet.getByRole('button', { name: 'Add leg', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(amounts.nth(1)).toBeFocused();
  await page.keyboard.type('25+5');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab'); // optional Subcategory
  await page.keyboard.press('Tab'); // Remove
  await expect(sheet.getByRole('button', { name: 'Remove', exact: true }).nth(1)).toBeFocused();
  await page.keyboard.press('Tab'); // Add leg
  await page.keyboard.press('Tab'); // Description
  await expect(sheet.locator('.field-input')).toBeFocused();
  await page.keyboard.type('Keyboard split');
  await page.keyboard.press('Tab');
  await expect(sheet.locator('input[type="date"]')).toBeFocused();
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+Tab');
  await expect(amounts.nth(1)).toBeFocused();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('25+5');
  await page.keyboard.press('Control+Enter');
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('[data-entry-row]').filter({ hasText: '₱70.00' })).toBeVisible();
  await expect(page.locator('[data-entry-row]').filter({ hasText: '₱30.00' })).toBeVisible();
});

test('nested help owns save and Escape, and restores focus one layer at a time', async ({ page }) => {
  await ready(page);
  const add = page.getByRole('button', { name: 'Add entry', exact: true });
  await add.click();
  const entry = page.locator('.sheet[data-state="open"]');
  await entry.getByPlaceholder('0.00').fill('42');
  await entry.getByRole('button', { name: 'FOOD', exact: true }).click();
  const helpTrigger = entry.getByRole('button', { name: 'Keyboard shortcuts' });
  await helpTrigger.click();
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true });
  await expect(help).toContainText('Ctrl+Enter');
  await page.keyboard.press('Control+Enter');
  await expect(help).toBeVisible();
  await expect(entry).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);
  await expect(entry).toBeVisible();
  await expect(helpTrigger).toBeFocused();
  await helpTrigger.dispatchEvent('keydown', { key: 'Escape', repeat: true });
  await expect(entry).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(entry).toHaveCount(0);
  await expect(add).toBeFocused();
});

test('bulk keyboard selection confirms deletion, preserves selection on Escape, then exits', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Enter bulk-select mode' }).click();
  await page.keyboard.press('Delete');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('Control+a');
  const rows = page.locator('[data-entry-row]');
  const count = await rows.count();
  await expect(page.getByText(`${count} selected`, { exact: true })).toBeVisible();
  await page.keyboard.press('Control+a');
  await expect(page.getByText(`${count} selected`, { exact: true })).toBeVisible();
  await page.keyboard.press('?');
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true });
  await expect(help).toContainText('Ctrl+A');
  await expect(help.getByText('Shift+N', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Delete');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText(`${count} selected`, { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Enter bulk-select mode' })).toBeVisible();
  await expect(page.locator('[data-entry-row]')).toHaveCount(count);
});

for (const width of [320, 1440]) {
  test(`help contains focus and the device preference survives reload at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await ready(page);
    await page.keyboard.press('?');
    const help = page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true });
    await expect(help).toBeVisible();
    const preference = help.getByRole('checkbox', { name: 'Enable character shortcuts' });
    await preference.focus();
    await page.keyboard.press('Tab');
    await expect(help.getByRole('button', { name: 'Close keyboard shortcuts' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(preference).toBeFocused();
    expect(await help.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`help-${width}.png`) });
    await page.keyboard.press('Space');
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Add entry', exact: true })).toBeVisible();
    await page.keyboard.press('Shift+N');
    await page.keyboard.press('?');
    await page.keyboard.press('g'); await page.keyboard.press('s');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/entries\//);
    await page.getByRole('button', { name: 'Keyboard shortcuts', exact: true }).click();
    await expect(help).toContainText('Character shortcuts are off');
    await expect(preference).not.toBeChecked();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Add entry', exact: true }).click();
    const sheet = page.locator('.sheet[data-state="open"]');
    await expect(sheet.getByPlaceholder('0.00')).toBeFocused();
    await sheet.getByRole('button', { name: 'FOOD', exact: true }).click();
    await sheet.getByPlaceholder('0.00').fill('15+5');
    await page.keyboard.press('Control+Enter');
    await expect(sheet).toHaveCount(0);
  });
}

test('Mac uses Cmd to save and contextual help displays the matching modifier', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }));
  await ready(page);
  await page.keyboard.press('Shift+N');
  const sheet = page.locator('.sheet[data-state="open"]');
  await sheet.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  const help = page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true });
  await expect(help).toContainText('Cmd+Enter');
  await page.keyboard.press('Escape');
  await sheet.getByRole('button', { name: 'FOOD', exact: true }).click();
  const amount = sheet.getByPlaceholder('0.00');
  await amount.fill('100-30');
  await page.keyboard.press('Control+Enter');
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Meta+Enter');
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('[data-entry-row]').filter({ hasText: '₱70.00' })).toBeVisible();
});

test('keyboard-opened Entry restores focus to Add when there was no focused opener', async ({ page }) => {
  await page.addInitScript(() => {
    new MutationObserver(() => {
      document.querySelectorAll('input.amount-input').forEach(input => input.classList.remove('amount-input'));
    }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  await ready(page);
  await page.keyboard.press('Shift+N');
  await expect(page.getByPlaceholder('0.00')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add entry', exact: true })).toBeFocused();
});

test('Edit exposes Delete on keyboard focus and recovers focus when its opener is removed', async ({ page }) => {
  await ready(page);
  const rows = page.locator('[data-entry-row]');
  const count = await rows.count();
  await page.keyboard.press('ArrowDown');
  await expect(rows.first()).toBeFocused();
  await page.keyboard.press('Enter');
  const sheet = page.locator('.sheet[data-state="open"]');
  await expect(sheet.getByPlaceholder('0.00')).toBeFocused();
  const remove = sheet.getByRole('button', { name: 'Delete entry', exact: true });
  for (let i = 0; i < 12 && !(await remove.evaluate(element => element === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(remove).toBeFocused();
  await expect(remove).toBeInViewport();
  await page.keyboard.press('Enter');
  await expect(sheet).toHaveCount(0);
  await expect(rows).toHaveCount(count - 1);
  await expect(page.getByRole('button', { name: 'Add entry', exact: true })).toBeFocused();
});

test('G sequences preserve the current Entries week and cancel on timeout or unrelated keys', async ({ page }) => {
  await ready(page, '/#/entries/2025-01-05');
  await page.keyboard.press('g'); await page.keyboard.press('e');
  await expect(page).toHaveURL(/#\/entries\/2025-01-05$/);
  await page.keyboard.press('g'); await page.keyboard.press('h');
  await expect(page).toHaveURL(/#\/home$/);
  await page.keyboard.press('g'); await page.keyboard.press('e');
  await expect(page).toHaveURL(/#\/entries\//);
  await expect(page).not.toHaveURL(/2025-01-05$/);
  await page.keyboard.press('g'); await page.keyboard.press('s');
  await expect(page).toHaveURL(/#\/summary$/);
  await page.keyboard.press('g');
  await page.waitForTimeout(1100);
  await page.keyboard.press('h');
  await expect(page).toHaveURL(/#\/summary$/);
  await page.keyboard.press('g'); await page.keyboard.press('x'); await page.keyboard.press('h');
  await expect(page).toHaveURL(/#\/summary$/);
});

for (const [day, foodRows] of [['2026-11-08', 1], ['2026-11-10', 3]] as const) {
test(`Entries arrows follow filters and endpoints; keyboard Edit rejects invalid amounts and saves expressions on ${day}`, async ({ page }) => {
  await page.clock.setFixedTime(new Date(`${day}T12:00:00+08:00`));
  await ready(page);
  await page.getByRole('radio', { name: 'Incoming', exact: true }).click();
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowUp');
  await expect(page.locator('[data-entry-row]')).toHaveCount(0);
  await page.getByRole('radio', { name: 'Outgoing', exact: true }).click();
  await page.getByRole('button', { name: /^Food \d+$/ }).click();
  const rows = page.locator('[data-entry-row]');
  await expect(rows).toHaveCount(foodRows);
  await page.keyboard.press('ArrowDown');
  await expect(rows.first()).toBeFocused();
  await page.keyboard.press('ArrowUp'); // clamp at the first endpoint
  await expect(rows.first()).toBeFocused();
  for (let i = 0; i < foodRows; i++) await page.keyboard.press('ArrowDown');
  await expect(rows.last()).toBeFocused(); // clamp at the last endpoint
  for (let i = 1; i < foodRows; i++) await page.keyboard.press('ArrowUp');
  await expect(rows.first()).toBeFocused();
  await page.keyboard.press('Enter');
  const sheet = page.locator('.sheet[data-state="open"]');
  const amount = sheet.getByPlaceholder('0.00');
  await expect(amount).toBeFocused();
  await page.keyboard.press('Control+a'); await page.keyboard.type('10+');
  await page.keyboard.press('Control+Enter');
  await expect(sheet).toBeVisible();
  await expect(amount).toHaveValue('10+');
  await page.keyboard.press('Control+a'); await page.keyboard.type('20+5');
  await page.keyboard.press('Control+Enter');
  await expect(sheet).toHaveCount(0);
  await expect(rows.first()).toContainText('₱25.00');
});
}
