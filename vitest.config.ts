import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Test against core's source so suites run without a prior build
      '@perfectmarkd/core': fileURLToPath(
        new URL('./packages/core/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    // Restores jsdom's storage under Node 26 + --no-webstorage (see file).
    setupFiles: ['apps/web/src/testing/webstorage-compat.ts'],
    include: [
      'packages/*/src/**/*.test.{ts,tsx}',
      'apps/*/src/**/*.test.{ts,tsx}',
    ],
  },
});
