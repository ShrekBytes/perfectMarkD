// ─────────────────────────────────────────────────────────────────────────────
// Vitest config for the Playwright golden suite (engine-port/08).
//
// Separate from the root vitest.config.ts: this suite runs against real
// Chromium (jsdom lies about heights — the paginator measures real layout,
// so its regression tests need a real layout engine), core is the only
// package it covers, and the browser is only downloaded where the suite
// runs (dev + CI). The root config's include patterns don't pick this file
// up: golden tests are named *.golden.test.ts and live under
// src/golden/, matched only here.
// ─────────────────────────────────────────────────────────────────────────────

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const katexCssPath = fileURLToPath(
  new URL('./node_modules/katex/dist/katex.min.css', import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors the root config's KaTeX aliases: the golden suite runs core's
      // pipeline exactly as the web app does, math stylesheet included.
      '@perfectmarkd/core/katex.css': katexCssPath,
      '@perfectmarkd/core': fileURLToPath(
        new URL('./src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    // One pool process for the whole suite: the browser instance is shared
    // (launching Chromium per test file would cost ~300ms × files), and a
    // single process keeps golden snapshot writes ordered for `vitest -u`.
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    include: ['src/golden/**/*.test.ts'],
    // Snapshot/golden files live next to their fixtures, not in __snapshots__.
    snapshotFormat: { printBasicPrototype: false },
  },
});
