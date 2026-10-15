import { defineConfig, devices } from '@playwright/test';

// Real frontend boundary, fake HTTP destinations only; no local credentials.
export default defineConfig({
  testDir: './e2e',
  testMatch: ['connection.spec.ts', 'sync-status.spec.ts'],
  workers: 1,
  retries: 0,
  use: { baseURL: 'http://localhost:1111', ...devices['Desktop Chrome'] },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1111',
    reuseExistingServer: false,
    env: { VITE_MOCK: 'false', VITE_GAS_URL: '', VITE_API_SECRET: '' },
  },
});
