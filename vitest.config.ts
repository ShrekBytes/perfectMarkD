import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const katexCssPath = fileURLToPath(
  new URL(
    './packages/core/node_modules/katex/dist/katex.min.css',
    import.meta.url,
  ),
);

export default defineConfig({
  resolve: {
    alias: {
      // Must precede the core alias: Vite string aliases prefix-match, so
      // '@perfectmarkd/core' would otherwise swallow this subpath. Tests get
      // the KaTeX stylesheet straight from katex's package (the same file
      // core's build copies into dist — see apps/web/src/canvas/katex-css.ts).
      '@perfectmarkd/core/katex.css': katexCssPath,
      // ?raw variant: the query defeats prefix matching, so it needs its own
      // exact entry — the query is preserved in the replacement so the raw
      // text (not a CSS module) is what gets imported.
      '@perfectmarkd/core/katex.css?raw': `${katexCssPath}?raw`,
      // ?inline variant (the Client Export document's stylesheet — see
      // apps/web/src/canvas/katex-css.ts): vitest externalizes CSS, so ?inline
      // would yield an empty string — tests get the raw text instead. The
      // processed variant (font URLs rewritten to origin-absolute assets) is
      // a dev/build behavior.
      '@perfectmarkd/core/katex.css?inline': `${katexCssPath}?raw`,
      // Test against core's source so suites run without a prior build
      '@perfectmarkd/core': fileURLToPath(
        new URL('./packages/core/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    // Process CSS imports instead of externalizing them to empty stubs: the
    // KaTeX stylesheet is imported as raw/inline text (canvas layout rules,
    // Client Export document) and tests assert on its content. Node_modules
    // paths would otherwise externalize to '' before query handling.
    css: true,
    // Restores jsdom's storage under Node 26 + --no-webstorage (see file).
    setupFiles: ['apps/web/src/testing/webstorage-compat.ts'],
    include: [
      'packages/*/src/**/*.test.{ts,tsx}',
      'apps/*/src/**/*.test.{ts,tsx}',
    ],
    // The real-Chromium golden suite (packages/core/src/golden/) runs under
    // its own config — packages/core/playwright.vitest.config.ts — via
    // `pnpm --filter @perfectmarkd/core test:golden` (CI runs it as its own
    // step after `pnpm test`). It needs Playwright's browser and a single
    // process; keeping it out keeps this suite browser-independent. The
    // server's export e2e (apps/server/playwright.vitest.config.ts) is
    // excluded the same way and runs via `pnpm --filter @perfectmarkd/server
    // test:e2e`.
    exclude: ['**/node_modules/**', '**/dist/**', '**/src/golden/**', '**/*.e2e.test.ts'],
  },
});
