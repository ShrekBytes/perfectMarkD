// ─────────────────────────────────────────────────────────────────────────────
// Vitest config for the Server Export's real-Chromium e2e suite (server/03).
//
// Separate from the root vitest.config.ts, mirroring packages/core's
// playwright.vitest.config.ts: this suite drives real Chromium through the
// app's /export fixture, which jsdom cannot do (no real layout, no
// Page.pdf). The root config's include patterns match this file's name only
// through the explicit *.e2e.test.ts exclusion, and CI runs it as its own
// step after the golden suite, sharing the same installed Chromium.
// ─────────────────────────────────────────────────────────────────────────────

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Test against core's source so the suite runs without a prior build.
      '@perfectmarkd/core': fileURLToPath(
        new URL('../../packages/core/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/export/*.e2e.test.ts'],
    // First run bundles the web protocol module with esbuild (shiki included)
    // and launches Chromium; generous budgets keep that off the default 5s.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
