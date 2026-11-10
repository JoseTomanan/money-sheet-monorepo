import { test as base, expect } from '@playwright/test';

export * from '@playwright/test';

// Page-level fake-destination handlers take precedence over this context boundary.
// An unhandled external request is blocked AND fails the test, never sent to GAS.
export const test = base.extend<{ networkBoundary: void }>({
  networkBoundary: [async ({ context }, use) => {
    const unexpected: string[] = [];
    await context.route(/^https?:\/\//, async route => {
      const url = new URL(route.request().url());
      if (url.origin === 'http://localhost:1111') await route.continue();
      else {
        unexpected.push(url.origin);
        await route.abort('blockedbyclient');
      }
    });
    await use();
    expect(unexpected, 'All external HTTP destinations must be intercepted by the test').toEqual([]);
  }, { auto: true }],
});
