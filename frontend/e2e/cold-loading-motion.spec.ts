import { expect, test } from './fixtures';

for (const width of [390, 1280]) for (const route of [
  { hash: 'home', root: '.home', loaded: '.hero-amount' },
  { hash: 'entries/2026-11-15', root: '.scroll-area', loaded: 'text=Entries' },
  { hash: 'summary', root: '.summary-view', loaded: 'text=Summary' },
]) for (const preference of ['reduce', 'no-preference'] as const) {
test(`${route.hash} cold placeholders at ${width}px with ${preference}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: preference });
  await page.addInitScript(() => {
    localStorage.setItem('ms_connection', JSON.stringify({ gasUrl: 'https://cold-loading.example/exec', apiSecret: 'test' }));
    localStorage.setItem('ms_mock_dismissed', '1');
  });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('https://cold-loading.example/**', async route => {
    await held;
    const action = new URL(route.request().url()).searchParams.get('action')!;
    await route.fulfill({ json: {
      getEntries: { entries: [] }, getMaster: { master: { onHand: 100, budgets: { FOOD: 100 } } },
      getCategories: { categories: { FOOD: ['Dining'] } }, getConfig: { config: { currency: '$' } },
      getStats: { stats: { categoryMonthChange: [], spendingPace: [], windowTotals: [], windowCategorySpend: [] } },
    }[action] });
  });
  try {
    await page.goto(`/#/${route.hash}`);
    const placeholders = page.locator(`${route.root} [class*="shimmer"]`);
    await expect(placeholders.first()).toBeVisible();
    const before = await placeholders.evaluateAll(elements => elements.map(el => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        animation: style.animationName, duration: style.animationDuration, iteration: style.animationIterationCount };
    }));
    expect(before.every(item => item.animation === (preference === 'reduce' ? 'none' : 'shimmer'))).toBe(true);
    if (preference === 'no-preference') {
      expect(before.every(item => item.duration === '1s' && item.iteration === 'infinite')).toBe(true);
      await page.emulateMedia({ reducedMotion: 'reduce' });
    }
    const after = await placeholders.evaluateAll(elements => elements.map(el => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        animation: style.animationName, opacity: style.opacity, background: style.backgroundColor,
        active: el.getAnimations().filter(animation => animation.playState === 'running').length };
    }));
    expect(after.map(({ x, y, width, height }) => ({ x, y, width, height }))).toEqual(
      before.map(({ x, y, width, height }) => ({ x, y, width, height })));
    expect(after.every(item => item.animation === 'none' && item.active === 0 && item.opacity === '1' && item.background !== 'rgba(0, 0, 0, 0)')).toBe(true);
    release();
    await expect(placeholders).toHaveCount(0);
    await expect(page.locator(route.root).locator(route.loaded).first()).toBeVisible();
  } finally {
    release();
  }
});
}
