import { test, expect, type Page, type Locator } from './fixtures';

async function boot(page: Page, preference: 'light' | 'dark' | 'system', os: 'light' | 'dark' = 'light') {
  await page.emulateMedia({ colorScheme: os, reducedMotion: 'reduce' });
  await page.addInitScript(pref => localStorage.setItem('theme-preference', pref), preference);
  await page.clock.setFixedTime(new Date('2026-09-11T12:00:00+08:00'));
  await page.goto('/');
  await page.locator('.app-shell').waitFor();
  await page.locator('.loading-spinner').waitFor({ state: 'detached' });
  await expect(page.getByText('Mock Mode', { exact: false }).first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

async function editEntry(page: Page) {
  await page.locator('.tab-bar-pill').getByRole('button', { name: 'Entries' }).click();
  await page.locator('.entry-card .entry-desc').first().click();
  await page.locator('.sheet[data-state="open"]').waitFor();
  await page.locator('.sheet[data-state="open"]').evaluate(async el => {
    await Promise.all(el.getAnimations().map(animation => animation.finished.catch(() => {})));
  });
}

for (const [preference, systemAppearance, appearance, chrome] of [
  ['light', 'dark', 'light', '#f4f5f6'],
  ['dark', 'light', 'dark', '#111315'],
  ['system', 'dark', 'dark', '#111315'],
] as const) {
  test(`mobile startup and Add Entry date follow ${preference} preference`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: systemAppearance, reducedMotion: 'reduce' });
    await page.addInitScript(pref => localStorage.setItem('theme-preference', pref), preference);
    await page.route('**/src/main.ts', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.goto('/');

    const override = page.locator('#theme-color-override');
    if (preference === 'system') {
      await expect(override).toHaveAttribute('media', 'not all');
      await expect(page.locator(`#theme-color-${appearance}`)).toHaveAttribute('content', chrome);
    } else {
      await expect(page.locator('html')).toHaveClass(`theme-${appearance}`);
      await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', appearance);
      await expect(override).toHaveAttribute('media', 'all');
      await expect(override).toHaveAttribute('content', chrome);
    }

    await page.unroute('**/src/main.ts');
    await page.reload();
    await page.getByRole('button', { name: 'Add entry', exact: true }).click();
    await expect(page.locator('.sheet[data-state="open"] input[type="date"]')).toHaveCSS('color-scheme', appearance);
  });
}

// Read rendered paint, compositing alpha and ancestor opacity over actual surfaces.
async function paint(locator: Locator, role: 'text' | 'background' | 'border' = 'text') {
  return locator.evaluate((element, role) => {
    type RGBA = [number, number, number, number];
    const rgba = (value: string): RGBA => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const data = ctx.getImageData(0, 0, 1, 1).data;
      return [data[0], data[1], data[2], data[3] / 255];
    };
    const over = (top: RGBA, bottom: RGBA): RGBA => {
      const alpha = top[3] + bottom[3] * (1 - top[3]);
      if (alpha === 0) return [0, 0, 0, 0];
      return [0, 1, 2].map(i => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / alpha).concat(alpha) as RGBA;
    };
    const chain: Element[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) chain.push(node);
    const style = getComputedStyle(element);
    let background: RGBA = role === 'background' ? [0, 0, 0, 0] : rgba(style.backgroundColor);
    let foreground = over(rgba(role === 'background' ? style.backgroundColor : role === 'border' ? style.borderLeftColor : style.color), background);
    for (const node of chain) {
      const computed = getComputedStyle(node);
      const opacity = Number(computed.opacity);
      foreground[3] *= opacity;
      background[3] *= opacity;
      if (node.parentElement) {
        const parent = rgba(getComputedStyle(node.parentElement).backgroundColor);
        foreground = over(foreground, parent);
        background = over(background, parent);
      }
    }
    const luminance = (color: RGBA) => color.slice(0, 3).reduce((sum, channel, i) => {
      const s = channel / 255;
      return sum + (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i];
    }, 0);
    const a = luminance(foreground), b = luminance(background);
    return { color: style.color, background: style.backgroundColor, border: style.borderTopColor,
      contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
  }, role);
}

for (const width of [390, 1024]) {
  test(`light rendering is preserved at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await boot(page, 'light', 'dark');
    for (const view of ['Home', 'Entries', 'Summary'] as const) {
      await page.locator('.tab-bar-pill').getByRole('button', { name: view }).click();
      // Windows Chromium baselines: other hosts still run rendered color checks below.
      if (process.platform === 'win32') {
        await expect(page).toHaveScreenshot(`light-${width}-${view}.png`, { animations: 'disabled', maxDiffPixels: 0, threshold: 0 });
      }
    }
    await editEntry(page);
    if (process.platform === 'win32') {
      await expect(page).toHaveScreenshot(`light-${width}-edit.png`, { animations: 'disabled', maxDiffPixels: 0, threshold: 0 });
    }
    expect(await paint(page.locator('.active-out'))).toMatchObject({
      color: 'rgb(193, 74, 50)', background: 'rgba(193, 74, 50, 0.08)', border: 'rgba(193, 74, 50, 0.2)',
    });
  });
}

test('dark destructive direction is quiet and readable', async ({ page }) => {
  await boot(page, 'dark');
  await editEntry(page);
  const rendered = await paint(page.locator('.active-out'));
  expect(rendered.background).toBe('rgba(233, 158, 147, 0.08)');
  expect(rendered.border).toBe('rgba(233, 158, 147, 0.18)');
  expect(rendered.contrast).toBeGreaterThanOrEqual(4.5);
  const handle = await page.getByRole('separator', { name: 'Drag to resize or dismiss' }).boundingBox();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y - 90, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('.delete-wrap-visible')).toBeVisible();
  await expect.poll(async () => (await paint(page.locator('.delete-btn'))).contrast).toBeGreaterThanOrEqual(4.5);
});

test('dark Incoming direction is muted and readable on its tint', async ({ page }) => {
  await boot(page, 'dark');
  await editEntry(page);
  await page.getByRole('button', { name: 'Incoming', exact: true }).click();
  const incoming = page.locator('.active-in');
  await expect(incoming).toHaveCSS('color', 'rgba(125, 186, 143, 0.9)');
  const rendered = await paint(incoming);
  expect(rendered.background).toBe('rgba(125, 186, 143, 0.06)');
  expect(rendered.contrast).toBeGreaterThanOrEqual(4.5);
});

test('dark Local Entry indicator uses a quiet indigo border', async ({ page }) => {
  await boot(page, 'dark');
  // Fail only the mutation boundary; all data stays in Mock Mode.
  await page.evaluate(async () => {
    const path = '/money-sheet-monorepo/src/lib/api.ts';
    const { gateway, setAdapter, ConnectionError } = await import(path);
    setAdapter(new Proxy(gateway(), { get(target, property) {
      if (property === 'addEntry') return async () => { throw new ConnectionError('Offline theme example'); };
      return Reflect.get(target, property);
    } }));
  });
  await page.getByRole('button', { name: 'Add entry', exact: true }).click();
  await page.getByRole('button', { name: 'Incoming', exact: true }).click();
  await page.locator('.amount-input').fill('100');
  await page.locator('.field-input').first().fill('Local theme example');
  await page.locator('.tag-pill', { hasText: 'FOOD' }).first().click();
  await page.locator('button.header-btn.save').click();
  await page.locator('.sheet[data-state="open"]').waitFor({ state: 'detached' });
  await page.locator('.tab-bar-pill').getByRole('button', { name: 'Entries' }).click();
  const row = page.locator('.entry-card', { hasText: 'Local theme example' });
  await expect(row.getByLabel('Not yet synced')).toBeVisible();
  await expect(row).toHaveCSS('border-left-color', 'rgba(153, 158, 205, 0.9)');
  expect((await paint(row, 'border')).contrast).toBeGreaterThanOrEqual(3);
  expect((await paint(row.locator('span').filter({ hasText: '+₱100.00' }).last())).contrast).toBeGreaterThanOrEqual(4.5);
});

test('Settings and OS changes keep semantic and Category colors in agreement', async ({ page }) => {
  await boot(page, 'system', 'light');
  const read = () => page.locator('.hero-card').evaluate(el => ({
    foreground: getComputedStyle(el).color,
    background: getComputedStyle(el).backgroundImage,
    category: getComputedStyle(document.querySelector('.entry-stripe')!).backgroundColor,
  }));
  const light = await read();
  await page.emulateMedia({ colorScheme: 'dark' });
  const root = page.locator('html');
  const scheme = page.locator('#theme-color-scheme');
  const override = page.locator('#theme-color-override');
  await expect(root).toHaveCSS('color-scheme', 'dark');
  await expect(override).toHaveAttribute('media', 'not all');
  // CSS tokens and Svelte's category colors settle independently. Capture the
  // complete dark palette rather than an intermediate frame with light stripes.
  await expect.poll(async () => {
    const value = await read();
    return value.foreground !== light.foreground
      && value.background !== light.background
      && value.category !== light.category;
  }).toBe(true);
  const dark = await read();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(root).toHaveCSS('color-scheme', 'light');
  await expect(scheme).toHaveAttribute('content', 'light');
  await expect(override).toHaveAttribute('content', '#f4f5f6');
  await expect(override).toHaveAttribute('media', 'all');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('.sheet[data-state="open"]').waitFor({ state: 'detached' });
  await page.locator('.tab-bar-pill').getByRole('button', { name: 'Home' }).click();
  await expect.poll(read).toEqual(light);
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(root).toHaveCSS('color-scheme', 'dark');
  await expect(scheme).toHaveAttribute('content', 'dark');
  await expect(override).toHaveAttribute('content', '#111315');
  await expect(override).toHaveAttribute('media', 'all');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('.sheet[data-state="open"]').waitFor({ state: 'detached' });
  await page.locator('.tab-bar-pill').getByRole('button', { name: 'Home' }).click();
  await expect.poll(read).toEqual(dark);
  await editEntry(page);
  const explicit = await paint(page.locator('.active-out'));
  await page.locator('button.header-btn.cancel').click();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('button', { name: 'System', exact: true }).click();
  await expect(scheme).toHaveAttribute('content', 'light dark');
  await expect(override).toHaveAttribute('media', 'not all');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.locator('.sheet[data-state="open"]').waitFor({ state: 'detached' });
  await editEntry(page);
  await expect.poll(() => paint(page.locator('.active-out'))).toEqual(explicit);
});

test('dark Home amounts and Category picker states are readable at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page, 'dark');
  const amounts = page.locator('.cat-amount');
  const canvas = await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor);
  await expect(amounts).toHaveCount(7);
  for (const amount of await amounts.all()) {
    expect((await paint(amount)).contrast).toBeGreaterThanOrEqual(4.5);
  }
  expect((await paint(page.getByRole('button', { name: 'Add entry', exact: true }))).contrast).toBeGreaterThanOrEqual(3);

  await page.getByRole('button', { name: 'Add entry', exact: true }).click();
  await page.getByRole('button', { name: 'Incoming', exact: true }).click();
  const pills = page.getByRole('group', { name: 'Category', exact: true }).getByRole('button');
  await expect(pills).toHaveCount(7);
  for (const pill of await pills.all()) {
    expect((await paint(pill)).contrast).toBeGreaterThanOrEqual(4.5);
    await pill.click();
    await expect(pill).toHaveAttribute('aria-pressed', 'true');
    await expect(pill).toHaveCSS('color', canvas);
    expect((await paint(pill)).contrast).toBeGreaterThanOrEqual(4.5);
  }
});

test('Reduce Transparency makes the mobile dock and Entries filters opaque', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Media emulation uses Chromium DevTools');
  await page.setViewportSize({ width: 390, height: 700 });
  await boot(page, 'dark');
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-transparency', value: 'no-preference' }],
  });
  const dock = page.locator('.tab-bar-pill');
  await dock.getByRole('button', { name: 'Entries' }).click();
  const filters = page.locator('.filter-bar-glass');
  const scroll = page.locator('.scroll-area');
  await scroll.evaluate(el => el.scrollTo({ top: el.scrollHeight }));
  await expect.poll(() => scroll.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await expect(dock).toHaveCSS('backdrop-filter', /blur/);
  await expect(filters).toHaveCSS('backdrop-filter', /blur/);

  await session.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }],
  });
  await expect(dock).toHaveCSS('backdrop-filter', 'none');
  await expect(dock).toHaveCSS('background-color', 'rgb(41, 44, 48)');
  await expect(filters).toHaveCSS('backdrop-filter', 'none');
  await expect(filters).toHaveCSS('background-color', 'rgb(22, 24, 27)');
});

test('dark negative amounts and bulk deletion remain readable on tinted surfaces', async ({ page }) => {
  await boot(page, 'dark');
  await page.getByRole('button', { name: 'Add entry', exact: true }).click();
  await page.getByRole('button', { name: 'Incoming', exact: true }).click();
  await page.locator('.amount-input').fill('-100');
  await page.locator('.field-input').first().fill('Negative theme example');
  await page.locator('.tag-pill', { hasText: 'FOOD' }).first().click();
  await page.locator('button.header-btn.save').click();
  await page.locator('.sheet[data-state="open"]').waitFor({ state: 'detached' });
  await page.locator('.tab-bar-pill').getByRole('button', { name: 'Entries' }).click();
  const row = page.locator('.entry-card', { hasText: 'Negative theme example' });
  const amount = row.locator('span[style*="--destructive"]');
  expect((await paint(amount)).contrast).toBeGreaterThanOrEqual(4.5);
  await page.getByRole('button', { name: 'Enter bulk-select mode' }).click();
  await row.click();
  await expect(row).toHaveAttribute('aria-checked', 'true');
  expect((await paint(amount)).contrast).toBeGreaterThanOrEqual(4.5);
  expect((await paint(page.locator('.delete-sel-btn'))).contrast).toBeGreaterThanOrEqual(4.5);
  await page.locator('.delete-sel-btn').click();
  const sheet = page.locator('.sheet[data-state="open"]');
  await expect(sheet).toHaveCSS('opacity', '1');
  const confirm = sheet.getByRole('button', { name: 'Delete entry', exact: true });
  expect((await paint(confirm)).contrast).toBeGreaterThanOrEqual(4.5);
  await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('dark Summary semantic text stays readable', async ({ page }) => {
  await boot(page, 'dark');
  await page.locator('.tab-bar-pill').getByRole('button', { name: 'Summary' }).click();
  const amounts = page.locator('span[style*="--destructive"], span[style*="--positive"]');
  expect(await amounts.count()).toBeGreaterThan(0);
  for (const amount of await amounts.all()) {
    expect((await paint(amount)).contrast).toBeGreaterThanOrEqual(4.5);
  }
  await page.getByRole('button', { name: 'Deeper statistics' }).click();
  const bar = page.locator('div[style*="background: var(--positive)"]');
  await expect(bar).toHaveCSS('opacity', '0.85');
  expect((await paint(bar, 'background')).contrast).toBeGreaterThanOrEqual(3);
});

for (const preference of ['dark', 'system'] as const) {
  test(`FINANCE stays muted yellow and readable with ${preference} preference`, async ({ page }) => {
    await boot(page, preference, 'dark');
    const chip = page.locator('.cat-chip', { hasText: 'Finance' });
    await expect(chip).toHaveCSS('background-color', 'rgba(201, 184, 94, 0.06)');
    await expect(chip.locator('.cat-dot')).toHaveCSS('background-color', 'rgba(201, 184, 94, 0.65)');
    await page.getByRole('button', { name: 'Add entry', exact: true }).click();
    await page.getByRole('button', { name: 'Incoming', exact: true }).click();
    const tag = page.locator('.tag-pill', { hasText: 'FINANCE' }).first();
    await expect(tag).toHaveCSS('color', 'rgba(201, 184, 94, 0.9)');
    await page.locator('.amount-input').fill('365');
    await page.locator('.field-input').first().fill('Finance yellow example');
    await tag.click();
    await page.locator('button.header-btn.save').click();
    await page.locator('.sheet[data-state="open"]').waitFor({ state: 'detached' });
    await page.locator('.tab-bar-pill').getByRole('button', { name: 'Entries' }).click();
    const band = page.locator('.entry-card', { hasText: 'Finance yellow example' }).locator('.entry-desc-band');
    await expect(band).toHaveCSS('color', 'rgba(201, 184, 94, 0.9)');
    expect((await paint(band.locator('.entry-desc'))).contrast).toBeGreaterThanOrEqual(4.5);
    await page.locator('.entry-card', { hasText: 'Finance yellow example' }).screenshot({ path: test.info().outputPath('finance-dark.png') });
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(band).toHaveCSS('color', preference === 'system' ? 'rgb(99, 107, 14)' : 'rgba(201, 184, 94, 0.9)');
  });
}
