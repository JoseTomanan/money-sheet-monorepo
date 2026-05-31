import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Real credentials live in the tests package, not in frontend/.env
loadEnv({ path: path.resolve(__dirname, "../../tests/.env") });

export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  retries: 0,
  // Sequential — one test at a time against the live sheet
  workers: 1,
  reporter: "list",
  use: {
    headless: false,
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1111",
    // true so Claude can pre-start the server; IMPORTANT: must be started with
    // VITE_MOCK=false (real mode). Kill any mock-mode server first if needed.
    reuseExistingServer: true,
    timeout: 30_000,
    env: { VITE_MOCK: "false" },
  },
});
