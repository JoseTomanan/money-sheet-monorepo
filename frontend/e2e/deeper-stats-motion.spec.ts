import { expect, test, type Page } from './fixtures';
import type { StatsData, StatsWindow } from '../src/lib/types';

const statisticsUrl = '/#/summary/statistics';
const statsEndpoint = 'https://statistics.example/exec';

function statsFor(windows: [StatsWindow, number, number, number][]): StatsData {
  return {
    categoryMonthChange: [],
    spendingPace: [],
    windowTotals: windows.map(([window, incoming, housing, food]) => ({
      window, incoming, outgoing: housing + food, net: incoming - housing - food,
    })),
    windowCategorySpend: windows.flatMap(([window, , housing, food]) => [
      { window, category: 'HOUSING', outgoing: housing },
      { window, category: 'FOOD', outgoing: food },
    ]),
  };
}

const initialStats = statsFor([
  ['30d', 200, 25, 75],
  ['3mo', 200, 300, 100],
  ['12mo', -25, 0, 0],
]);

async function openStatistics(page: Page, getStats = () => initialStats) {
  await page.route(`${statsEndpoint}**`, route => route.fulfill({ json: { stats: getStats() } }));
  await page.goto(statisticsUrl);
  await expect(page.locator('.dist-strip')).toBeVisible();

  // Replace only the Stats read at the HTTP boundary. Mock Mode supplies the other data.
  await page.evaluate(async gasUrl => {
    const root = '/money-sheet-monorepo/src/lib/';
    const { MockAdapter } = await import(root + 'adapter-mock.ts');
    const { RealAdapter } = await import(root + 'adapter-real.ts');
    const { setAdapter } = await import(root + 'api.ts');
    const { store } = await import(root + 'store.svelte.ts');
    await store.refreshAll(true);
    const statsAdapter = new RealAdapter(() => ({ gasUrl, apiSecret: 'test' }));
    setAdapter(Object.assign(new MockAdapter(), { getStats: () => statsAdapter.getStats() }));
    await store.refreshAll(true);
  }, statsEndpoint);
  await expect(page.locator('.net-verdict-card')).toContainText('100.00');
  await settleFixture(page);
}

async function settleFixture(page: Page) {
  await page.locator('.deeper-stats-view').evaluate(async view => {
    await Promise.all(view.getAnimations({ subtree: true }).map(animation => animation.finished));
  });
}

async function captureNextChartFrame(page: Page, changed: { window?: string; incoming?: string }) {
  const frame = await page.evaluateHandle(changed => {
    const view = document.querySelector('.deeper-stats-view')!;
    const incomingText = () => view.querySelector('.flow-readout .text-center span')?.textContent?.trim();
    const selectedRadio = () => view.querySelector('[role="radio"][aria-checked="true"]');
    const percent = (size: number, available: number) => Math.round(100 * size / available);

    // Arm before activation. Wait for the new render, then read labels and layout in one frame.
    return {
      result: new Promise(resolve => {
        const observer = new MutationObserver(() => {
          if (changed.window && selectedRadio()?.textContent?.trim() !== changed.window) return;
          if (changed.incoming && incomingText() !== changed.incoming) return;
          observer.disconnect();

          requestAnimationFrame(() => {
            const flowBars = Array.from(view.querySelectorAll('.flow-readout > div > div:first-child > div'));
            const stripBars = Array.from(view.querySelectorAll('.dist-strip > div'));
            const stripWidth = stripBars.reduce((width, bar) => width + bar.getBoundingClientRect().width, 0);
            const rows = Array.from(view.querySelectorAll('.cat-row'));
            const rowBars = rows.map(row => row.querySelector('.overflow-hidden > div')!);
            const text = (element: Element | null) => (element as HTMLElement | null)?.innerText.trim();
            const width = (bar: Element) => bar.getBoundingClientRect().width;
            resolve({
              selected: selectedRadio()?.textContent?.trim(),
              focused: document.activeElement?.textContent?.trim(),
              flow: Array.from(view.querySelectorAll('.flow-readout .text-center span'), text),
              heights: flowBars.map(bar => percent(bar.getBoundingClientRect().height, bar.parentElement!.getBoundingClientRect().height)),
              net: text(view.querySelector('.net-verdict-card')),
              strips: stripBars.map(bar => ({ label: bar.getAttribute('title'), share: percent(width(bar), stripWidth) })),
              categories: rows.map((row, index) => ({
                label: text(row.querySelector('.cat-label')),
                amount: text(row.querySelector('.cat-row-main div span')),
                share: text(row.querySelector('.cat-pct')),
                width: percent(width(rowBars[index]), width(rowBars[index].parentElement!)),
              })),
              empty: view.textContent?.includes('No spending in this window.'),
              transitions: [...flowBars, ...stripBars, ...rowBars]
                .flatMap(bar => bar.getAnimations())
                .map(animation => (animation as CSSTransition).transitionProperty),
            });
          });
        });
        observer.observe(view, { attributes: true, childList: true, characterData: true, subtree: true });
      }),
    };
  }, changed);
  return async () => {
    try {
      return await frame.evaluate(frame => frame.result);
    } finally {
      await frame.dispose();
    }
  };
}

const category = (label: string, amount: string, share: string, width: number) => ({ label, amount, share, width });
const emptyCategories = ['Transit', 'Health', 'Finance', 'Lifestyle', 'Misc'].map(label => category(label, '₱0.00', '0.0%', 0));

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  for (const width of [390, 1440]) {
    test.describe(`${width}px with ${reducedMotion} motion`, () => {
      test.use({ viewport: { width, height: 900 }, isMobile: width === 390, hasTouch: width === 390, reducedMotion });

      test('window selection updates amounts and chart geometry in the same frame', async ({ page }) => {
        await openStatistics(page);
        const pointer = page.getByRole('radio', { name: '3 months' });
        const keyboard = page.getByRole('radio', { name: '12 months' });
        const firstFrame = await captureNextChartFrame(page, { window: '3 months' });
        if (width === 390) await pointer.tap();
        else await pointer.click();

        expect(await firstFrame()).toMatchObject({
          selected: '3 months',
          flow: ['₱200.00', '₱400.00'],
          heights: [50, 100],
          net: expect.stringMatching(/Shrank[\s\S]*-₱200\.00/),
          strips: [{ label: 'Housing: ₱300.00', share: 75 }, { label: 'Food: ₱100.00', share: 25 }],
          categories: [category('Housing', '₱300.00', '75.0%', 100), category('Food', '₱100.00', '25.0%', 33), ...emptyCategories],
          empty: false,
          transitions: [],
        });

        // Switch again as soon as the first frame is captured, with no settling delay.
        const zeroFrame = await captureNextChartFrame(page, { window: '12 months' });
        await keyboard.focus();
        await page.keyboard.press('Enter');
        expect(await zeroFrame()).toMatchObject({
          selected: '12 months',
          focused: '12 months',
          flow: ['-₱25.00', '₱0.00'],
          heights: [0, 0],
          net: expect.stringMatching(/Shrank[\s\S]*-₱25\.00/),
          strips: [],
          categories: [category('Housing', '₱0.00', '0.0%', 0), category('Food', '₱0.00', '0.0%', 0), ...emptyCategories],
          empty: true,
          transitions: [],
        });
        await expect(keyboard).toHaveCSS('transition-property', 'color, background');
        await expect(keyboard).toHaveCSS('transition-duration', '0.15s');
      });
    });
  }
}

test.describe('refreshing statistics on a touch viewport', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('a refreshed Stats snapshot updates the selected window in one frame', async ({ page }) => {
    let stats = initialStats;
    await openStatistics(page, () => stats);
    const selected = page.getByRole('radio', { name: '3 months' });
    await selected.focus();
    await page.keyboard.press('Enter');
    await expect(selected).toHaveAttribute('aria-checked', 'true');
    await settleFixture(page);

    const refreshedFrame = await captureNextChartFrame(page, { incoming: '₱600.00' });
    stats = statsFor([['3mo', 600, 60, 240]]);
    await page.evaluate(async () => {
      const path = '/money-sheet-monorepo/src/lib/store.svelte.ts';
      const { store } = await import(path);
      await store.refreshAll(true);
    });

    expect(await refreshedFrame()).toMatchObject({
      selected: '3 months',
      focused: '3 months',
      flow: ['₱600.00', '₱300.00'],
      heights: [100, 50],
      net: expect.stringMatching(/Grew[\s\S]*₱300\.00/),
      strips: [{ label: 'Food: ₱240.00', share: 80 }, { label: 'Housing: ₱60.00', share: 20 }],
      categories: [category('Food', '₱240.00', '80.0%', 100), category('Housing', '₱60.00', '20.0%', 25), ...emptyCategories],
      empty: false,
      transitions: [],
    });
    await expect(page).toHaveURL(/#\/summary\/statistics$/);
  });
});
