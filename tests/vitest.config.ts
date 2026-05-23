import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    setupFiles: ["dotenv/config"],
    globals: true,
    fileParallel: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
