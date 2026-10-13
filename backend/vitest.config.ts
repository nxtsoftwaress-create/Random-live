import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    // Integration tests are opt-in (need real Postgres + Redis):
    //   RUN_INTEGRATION=1 npx vitest run --config vitest.integration.config.ts
    exclude: ["tests/integration/**"],
    testTimeout: 15000,
  },
});
