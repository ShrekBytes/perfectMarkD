import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import rootConfig from '../../vitest.config';

// Unit tests live under the root vitest.config.ts: it carries the KaTeX
// stylesheet aliases (vitest externalizes node_modules CSS to '' BEFORE
// query handling, which would empty every `?raw`/`?inline` katex import —
// see apps/web/src/canvas/katex-css.ts), css:true, and the repo-wide include
// globs. Vitest resolves config from the working directory and prefers this
// file over apps/web/vite.config.ts, so a run scoped to this package
// (`pnpm --filter @perfectmarkd/web exec vitest run …`) resolves the same
// config as `pnpm test` from the root instead of the app's dev config.
// The root override makes the root config's relative include/setupFiles
// globs resolve against the repo root, exactly as they do there.
export default defineConfig({
  ...rootConfig,
  root: fileURLToPath(new URL('../..', import.meta.url)),
});
