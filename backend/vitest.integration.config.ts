import { defineConfig } from "vitest/config";

/**
 * Integration suite — runs the real server + Socket.IO loop against whatever
 * stores are reachable (falls back to in-memory when Postgres/Redis are down).
 *
 *   npm run test:integration
 *
 * Kept separate from vitest.config.ts so the fast unit suite stays hermetic.
 */
export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
