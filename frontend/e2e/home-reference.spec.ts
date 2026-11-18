import { test, expect } from './fixtures';

test('Home keeps one readable density and keyboard targets as its sections reflow', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-09-11T12:00:00+08:00'));
  await page.goto('/');
  const balance = page.getByRole('region', { name: 'On hand' });
  await expect(balance).toBeVisible();
  const readDensity = () => page.locator('.home').evaluate(el => {
    const css = (selector: string) => getComputedStyle(el.querySelector(selector)!);
    return { body: css('.cat-name').fontSize, row: css('.today-row').paddingTop,
      balance: css('.hero-amount span').fontSize, date: css('.entry-date-lead').fontFamily };
  });
  const wide = await readDensity();
  expect(wide.date).not.toContain('Mono');
  await expect(balance).toHaveCSS('box-shadow', 'none');
  await expect(balance).toHaveCSS('background-image', 'none');
  await expect(page.locator('.page-title')).toHaveCSS('font-family', /system-ui/);
  await expect(page.locator('.hero-amount span')).toHaveCSS('font-family', /Roboto Mono/);
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await readDensity()).toEqual(wide);
    for (const name of ['All entries', 'See summary', 'Open settings', 'Keyboard shortcuts', 'Open command menu']) {
      const button = page.getByRole('button', { name, exact: true });
      const box = await button.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    const rows = page.locator('.cat-chip');
    await expect(rows).toHaveCount(7);
    const boxes = await rows.evaluateAll(els => els.map(el => el.getBoundingClientRect().y));
    expect(boxes[6]).toBeGreaterThan(boxes[0]);
    if (width < 1024) {
      await page.locator('.scroll-area').evaluate(el => el.scrollTo({ top: el.scrollHeight }));
      const last = (await rows.last().boundingBox())!;
      const navigation = (await page.locator('.tab-bar-pill').boundingBox())!;
      expect(last.y + last.height).toBeLessThanOrEqual(navigation.y);
    }
  }
  await page.getByRole('button', { name: 'All entries', exact: true }).focus();
  await expect(page.getByRole('button', { name: 'All entries', exact: true })).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/entries\//);
});

test('Home reference in light and dark at narrow and wide widths', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-09-11T12:00:00+08:00'));
  await page.goto('/');
  await expect(page.locator('.hero-amount')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.screenshot({ path: test.info().outputPath(`home-${theme}-${width}.png`), fullPage: true });
    }
    await page.getByRole('button', { name: 'Add entry', exact: true }).click();
    await expect(page.locator('.amount-input')).toHaveCSS('font-family', /Roboto Mono/);
    await expect(page.locator('.amount-input')).toHaveCSS('font-variant-numeric', 'tabular-nums');
    await page.locator('.amount-input').fill('100-');
    await page.locator('.field-input').first().click();
    await expect(page.locator('.leg-error')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`controls-${theme}.png`), fullPage: true });
    await page.locator('button.header-btn.cancel').click();
    await expect(page.locator('.sheet[data-state="open"]')).toHaveCount(0);
  }
});
