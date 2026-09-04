import { cpSync, readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as {
  dependencies?: Record<string, string>;
};

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  target: 'es2022',
  clean: true,
  // Runtime deps (markdown-it, shiki, katex, …) stay external: pnpm makes them
  // resolvable from this package for every workspace consumer, and bundling
  // shiki's grammar set into dist would be enormous.
  external: Object.keys(pkg.dependencies ?? {}).map(
    (dep) =>
      new RegExp(`^${dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\/|$)`),
  ),
  onSuccess: async () => {
    // KaTeX's stylesheet and font files are static assets: copy them into dist
    // so consumers can `import '@perfectmarkd/core/katex.css'` without reaching
    // into the katex package themselves. Font URLs inside the CSS are relative
    // and resolve against dist/fonts/.
    cpSync(
      new URL('./node_modules/katex/dist/katex.min.css', import.meta.url),
      new URL('./dist/katex.css', import.meta.url),
    );
    cpSync(
      new URL('./node_modules/katex/dist/fonts', import.meta.url),
      new URL('./dist/fonts', import.meta.url),
      {
        recursive: true,
      },
    );
  },
});
