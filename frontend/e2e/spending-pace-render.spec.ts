import { expect, test } from './fixtures';

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  for (const width of [390, 1440]) {
    test(`spending pace is complete on entry and return at ${width}px with ${reducedMotion}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion });
      await page.addInitScript(() => {
        const frames: unknown[] = [];
        (window as any).__paceFrames = frames;
        const observer = new MutationObserver(() => {
          const svg = document.querySelector<SVGElement>('.pace-chart svg');
          if (!svg || svg.dataset.captured) return;
          svg.dataset.captured = 'true';
          requestAnimationFrame(() => {
            const paths = [...svg.querySelectorAll('path')];
            const guide = svg.querySelector('line[stroke-dasharray]');
            const endpoint = svg.querySelector('circle');
            frames.push({
              label: svg.getAttribute('aria-label'),
              paths: paths.map(path => ({ d: path.getAttribute('d'), opacity: getComputedStyle(path).opacity, dash: path.getAttribute('stroke-dashoffset') })),
              guide: guide && getComputedStyle(guide).opacity,
              endpoint: endpoint && getComputedStyle(endpoint).opacity,
              animations: svg.getAnimations({ subtree: true }).length,
            });
          });
        });
        observer.observe(document, { childList: true, subtree: true });
      });
      await page.goto('/#/summary');
      await expect.poll(() => page.evaluate(() => (window as any).__paceFrames.length)).toBe(1);
      await page.evaluate(() => { location.hash = '#/home'; });
      await expect(page.locator('.pace-chart')).toHaveCount(0);
      await page.evaluate(() => { location.hash = '#/summary'; });
      await expect.poll(() => page.evaluate(() => (window as any).__paceFrames.length)).toBe(2);
      const frames = await page.evaluate(() => (window as any).__paceFrames);
      for (const frame of frames) {
        expect(frame.label).toMatch(/^Cumulative spending,/);
        expect(frame.paths).toHaveLength(3);
        expect(frame.paths.map((path: { opacity: string }) => path.opacity)).toEqual(['0.5', '0.08', '1']);
        expect(frame.paths.every((path: { d: string; dash: string | null }) => path.d && path.dash === null)).toBe(true);
        if (frame.guide !== null) expect(frame.guide).toBe('0.6');
        if (frame.endpoint !== null) expect(frame.endpoint).toBe('1');
        expect(frame.animations).toBe(0);
      }
    });
  }
}
