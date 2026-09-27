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
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/src/golden/**',
      '**/*.e2e.test.ts',
    ],
    // Four workers, below vitest's default of `cpus - 1` (7 on an 8-core box).
    // That default still oversubscribes the machine this suite runs on: the
    // cores are shared with the Compose stack (api, umami, caddy) and whatever
    // else the box is doing, and the heavy jsdom suites then cost several times
    // their isolated price because workers starve each other rather than
    // getting through their work. Measured on the dev host, quiet box:
    //
    //     test (isolated)   8 workers   6      4      2
    //     guard > re-prompt   7.5s    6.6s   4.0s   3.0s
    //     guard > resets      8.3s    6.0s   5.5s   3.3s
    //     shell > pane       1.0s    0.8s   0.4s   0.3s
    //     shell > top bar    1.4s    1.2s   0.7s   0.5s
    //     suite            [51s]   [53s]  [56s]  [76s]
    //
    // The guard tests budget 20s and take 2.4s alone, so they were already
    // spending a third of a budget before the box got busy, and the 5s-budget
    // tests 4.9-5.0x theirs. Under 4 busy cores the 20s tests measured
    // 9.9-12.5s at the default and 6.8-8.3s here, and the suite failed 2 runs
    // in 3 at 8 workers against 7 in 7 clean at 4, for 95-99s of wall time
    // against 84-86s. Roughly double the headroom on every tight test for ~15%
    // more wall time: a trustworthy signal, not a fast one.
    //
    // Fixed rather than derived from the CPU count, so the resource shape is
    // the same on every machine and a red run means one thing everywhere. CI
    // has fewer cores and no Compose stack beside it, so this can only relax
    // the contention there, never add to it.
    maxWorkers: 4,
  },
});
