// ─────────────────────────────────────────────────────────────────────────────
// The Playwright harness for the engine's golden regression suite.
//
// One Chromium instance serves the whole suite. Core's source is bundled
// once per run (esbuild, browser platform — the same transformation the app's
// build performs) and served into the page through route interception;
// tests then drive the full pipeline (render → paginate → layouts →
// exportHTML) inside real Chromium, where DOM measurement is real layout.
// jsdom lies about heights; this harness is why the paginator's golden
// tests can exist at all.
//
// Everything the page needs is served over https://golden.local/ (a
// fictional origin intercepted before it hits any network): the engine
// bundle, the mermaid hook bundle, and the KaTeX stylesheet. No dev
// server, no disk writes, no port races.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import { build as esbuildBuild } from 'esbuild';

import type { OutlineEntry } from '../paginator.js';
import type { DocumentSettings } from '../settings.js';

// esbuild bundles core's source for the page. It's a direct devDependency
// here (the same tool tsup uses for the dist build); importing it directly
// keeps the harness independent of tsup's internal dependency layout.
const SRC_DIR = fileURLToPath(new URL('..', import.meta.url)); // …/packages/core/src/

const ORIGIN = 'https://golden.local';

// ─── Browser lifecycle ────────────────────────────────────────────────────────

let browser: Browser | undefined;
let page: Page | undefined;

/** Node-side registry of served modules: routes read from it, tests (still
 *  Node-side) write to it. Lives in the harness module, not the page. */
const servedFiles = new Map<string, string>();

export async function getPage(): Promise<Page> {
  if (page) return page;
  browser ??= await chromium.launch();
  const context = await browser.newContext();
  const p = await context.newPage();

  // Serve the in-memory registry at the fictional origin: no filesystem,
  // no dev server, no port races — Chromium never talks to a real network.
  await p.route(`${ORIGIN}/**`, (route) => {
    const name = new URL(route.request().url()).pathname;
    const body = servedFiles.get(name);
    if (body === undefined) {
      return route.fulfill({ status: 404, body: `no such file ${name}` });
    }
    return route.fulfill({ contentType: 'application/javascript', body });
  });

  await p.goto(`${ORIGIN}/`);
  page = p;
  return p;
}

/** Shuts the shared browser down. Call from afterAll. */
export async function closeBrowser(): Promise<void> {
  await page?.close().catch(() => undefined);
  page = undefined;
  await browser?.close().catch(() => undefined);
  browser = undefined;
}

// ─── Bundles ──────────────────────────────────────────────────────────────────

const engineBundle = once(async () => {
  const result = await esbuildBuild({
    entryPoints: [join(SRC_DIR, 'index.ts')],
    bundle: true,
    format: 'esm',
    write: false,
    platform: 'browser',
  });
  return result.outputFiles[0]!.text;
});

const mermaidBundle = once(async () => {
  const result = await esbuildBuild({
    entryPoints: [join(SRC_DIR, '../../../apps/web/src/canvas/mermaid.ts')],
    bundle: true,
    format: 'esm',
    write: false,
    platform: 'browser',
    alias: { '@perfectmarkd/core': join(SRC_DIR, 'index.ts') },
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  return result.outputFiles[0]!.text;
});

const katexCSS = once(async () => {
  // Same file core's tsup build copies into dist/katex.css — read straight
  // from the dependency so no prior build is required.
  return await readFile(
    join(SRC_DIR, '../node_modules/katex/dist/katex.min.css'),
    'utf8',
  );
});

/** Runs an async factory once; concurrent callers share the one promise. */
function once<T>(factory: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | undefined;
  return () => (promise ??= factory());
}

async function serveBundle(name: string, text: string): Promise<string> {
  await getPage(); // routes must be armed before anything requests the URL
  // Route lookups use the URL's pathname, which carries a leading slash.
  servedFiles.set(`/${name}`, text);
  return `${ORIGIN}/${name}`;
}

/** The engine module URL, served fresh for this run. */
export async function engineURL(): Promise<string> {
  return await serveBundle('engine.js', await engineBundle());
}

/** The web app's mermaid hook URL (its own bundle — mermaid itself is huge
 *  and only the math+mermaid golden document needs it). */
export async function mermaidURL(): Promise<string> {
  return await serveBundle('mermaid.js', await mermaidBundle());
}

/** The KaTeX stylesheet text, exactly as core ships it. */
export async function mathCSS(): Promise<string> {
  return await katexCSS();
}

export interface OverflowViolation {
  page: number;
  tag: string;
}

// ─── Measurement ───────────────────────────────────────────────────────────────

/** In-page source that lays out an export document and measures each page:
 *  occupied content height (bottom of the lowest node relative to the
 *  content box top) and any node extending past the content box bottom.
 *  Shared by the pipeline runner and the standalone measureExport — one
 *  implementation so the two can't drift. */
const MEASURE_EXPORT = /* js */ `
  ({ exportHTML }) => {
    const host = document.createElement('div');
    host.innerHTML = exportHTML;
    document.body.appendChild(host);
    const contentHeights = [];
    const violations = [];
    for (const [i, box] of Array.from(host.querySelectorAll('.mpdf-export-page')).entries()) {
      const content = box.querySelector('.mpdf-doc');
      if (!content) { contentHeights.push(0); continue; }
      const boxRect = content.getBoundingClientRect();
      let bottom = boxRect.top;
      for (const node of content.children) {
        const r = node.getBoundingClientRect();
        bottom = Math.max(bottom, r.bottom);
        if (r.bottom - boxRect.bottom > 2.5) {
          violations.push({ page: i + 1, tag: node.tagName });
        }
      }
      contentHeights.push(Math.round(bottom - boxRect.top));
    }
    host.remove();
    return { contentHeights, violations };
  }
`;

/** Measures the export HTML in Chromium: the occupied content height per
 *  page, and any node that extends past its page's content box bottom. */
export async function measureExport(exportHTML: string): Promise<{
  contentHeights: number[];
  violations: OverflowViolation[];
}> {
  const p = await getPage();
  return await p.evaluate(
    `(${MEASURE_EXPORT})(${JSON.stringify({ exportHTML })})`,
  );
}

// ─── The pipeline run ─────────────────────────────────────────────────────────

/** What a golden assertion sees of one laid-out page: node signatures
 *  (structure + split detail) and the headings it carries. */
export interface GoldenPage {
  /** Per-node signatures in document order, e.g.
   *  `H2 "Section 1"`, `P`, `OL[12@5]`, `TABLE[14r+th]`, `PRE[22l]`. */
  sigs: string[];
  /** Headings on this page in document order. */
  headings: { text: string; level: number }[];
}

export interface GoldenResult {
  pageCount: number;
  pages: GoldenPage[];
  outline: OutlineEntry[];
  exportHTML: string;
  /** Measured content height per page, rounded to whole px — guards
   *  against regressions that keep the count but overflow the box. */
  contentHeights: number[];
}

export interface RunOptions {
  title?: string;
  /** Inlines the KaTeX stylesheet into the export document the way the
   *  web app does (default: yes, so export HTML is print-realistic). */
  includeMathCSS?: boolean;
  /** Renders ```mermaid fences via the web app's hook bundle. Default
   *  false: only the math+mermaid golden document opts in (the bundle is
   *  ~8MB and slow to build). */
  renderMermaid?: boolean;
}

/** In-page source of the pipeline runner. Self-contained — no Node-side
 *  closure. `modules` carries the URL strings to import. */
const RUN_PIPELINE = /* js */ `
  async ({ modules, markdown, settings, options }) => {
    const core = await import(modules.engine);

    const renderMermaid = modules.mermaid
      ? (await import(modules.mermaid)).renderMermaid
      : undefined;

    const isRTL = core.isRTLContent(markdown);
    const docCSS = core.buildDocCSS(settings, isRTL);
    const geometry = core.resolvePageGeometry(settings);

    const allPages = [];
    for (const section of core.splitMarkdownSections(markdown)) {
      const { html } = await core.renderMarkdown(section, {
        settings: {
          codeTheme: settings.codeTheme,
          hideFrontmatter: settings.hideFrontmatter,
        },
        renderMermaid,
      });
      const container = document.createElement('div');
      container.innerHTML = html;
      allPages.push(
        ...core.paginateEl(
          container, geometry.contentW, geometry.contentH, docCSS,
        ),
      );
    }
    if (allPages.length === 0) allPages.push([]);

    const layouts = core.buildPageLayouts(allPages, settings, options.title);
    const outline = core.extractOutlineEntries(layouts);
    const exportHTML = core.buildExportHTML(
      layouts, settings, () => undefined,
      { title: options.title, isRTL, mathCSS: options.mathCSS ?? '' },
    );

    // Structural digest of every page: per-node signatures that make
    // goldens answer *what* changed, not just that something did —
    // OL[n@m] lists item counts and start-attribute numbering, TABLE
    // fragment row counts + thead replication, PRE line counts, heading
    // text. Tag-only digests can't see numbering or split-structure
    // regressions.
    const describeNode = (n) => {
      let d = n.tagName;
      if (n.tagName === 'OL' || n.tagName === 'UL') {
        const items = n.children.length;
        const start = n.getAttribute('start');
        d += '[' + items + (start !== null ? '@' + start : '') + ']';
      } else if (n.tagName === 'TABLE') {
        const rows = n.querySelectorAll('tbody tr').length;
        d += '[' + rows + 'r' + (n.querySelector('thead') ? '+th' : '') + ']';
      } else if (n.tagName === 'PRE') {
        const text = n.textContent ?? '';
        let lines = text.split('\\n').length;
        if (text.endsWith('\\n')) lines -= 1;
        d += '[' + lines + 'l]';
      } else if (/^H[1-6]$/.test(n.tagName)) {
        // guillemets, not quotes: the signature crosses the evaluate
        // boundary and the snapshot serializer raw — raw '"' would nest
        // badly in the golden JSON.
        d += ' «' + (n.textContent ?? '').trim() + '»';
      }
      return d;
    };

    const pages = layouts.map((layout) => ({
      sigs: layout.pageNodes.map(describeNode),
      headings: layout.pageNodes.flatMap((node) => {
        const own = /^H[1-6]$/.test(node.tagName) ? [node] : [];
        const nested = Array.from(
          node.querySelectorAll('h1,h2,h3,h4,h5,h6'),
        );
        return [...own, ...nested].map((el) => ({
          text: (el.textContent ?? '').trim(),
          level: parseInt(el.tagName[1], 10),
        }));
      }),
    }));

    // Measure the laid-out export document with the shared measurement
    // source (same one measureExport serves standalone callers).
    const { contentHeights, violations } = (${MEASURE_EXPORT})({ exportHTML });

    return { pages, outline, exportHTML, contentHeights, violations, pageCount: layouts.length };
  }
`;

/** Runs the full pipeline over `markdown` in real Chromium: every section
 *  renders (math typeset, code highlighted), paginates with real layout
 *  measurement, builds page layouts, and assembles the export HTML. The
 *  result carries the structural digest golden files assert on, plus the
 *  export HTML for overflow measurement. */
export async function runPipeline(
  markdown: string,
  settings: DocumentSettings,
  options: RunOptions = {},
): Promise<GoldenResult & { violations: OverflowViolation[] }> {
  const p = await getPage();
  const [engine, mermaid, math] = [
    await engineURL(),
    options.renderMermaid ? await mermaidURL() : undefined,
    options.includeMathCSS === false ? undefined : await mathCSS(),
  ];

  const payload = {
    modules: { engine, mermaid },
    markdown,
    settings,
    options: { title: options.title ?? 'Golden', mathCSS: math },
  };

  return (await p.evaluate(
    `(${RUN_PIPELINE})(${JSON.stringify(payload)})`,
  )) as GoldenResult & {
    violations: OverflowViolation[];
  };
}
