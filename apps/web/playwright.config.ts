import { defineConfig } from '@playwright/test';

// Web E2E smoke suite (ticket editor-app/10). The app is exercised as the
// production bundle: vite build → vite preview serves apps/web/dist, and the
// tests drive it in real Chromium — the same browser family the Client Export
// print pipeline targets and the engine's golden suite runs under.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github']] : [['list']],
  // Renders are debounced (400ms) and the sample's first run loads the lazy
  // mermaid chunk; give slow steps room. Polls exit early on success.
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  webServer: {
    // Core's dist must exist (the web bundle imports it); rebuilding both
    // here keeps `pnpm --filter @perfectmarkd/web test:e2e` self-contained.
    command:
      'pnpm --filter @perfectmarkd/core build && pnpm exec vite build && pnpm exec vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
