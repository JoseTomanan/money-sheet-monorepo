import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ['home-states.spec.ts', 'api.spec.ts', 'connection.spec.ts', 'sync-status.spec.ts', 'metadata-freshness.spec.ts', 'keyboard-admission.spec.ts', 'command-menu-sync.spec.ts', 'behavior-lifetime.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: 'test-results/mock',
  use: {
    baseURL: "http://localhost:1111",
    trace: "retain-on-failure",
    screenshot: 'only-on-failure',
    timezoneId: 'Asia/Manila',
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1111",
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      VITE_MOCK: "true",
      VITE_GAS_URL: '',
      VITE_API_SECRET: '',
    },
  },
});
