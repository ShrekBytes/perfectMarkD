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
// bundle, the mermaid hook bundle, the KaTeX stylesheet, and every font the
// golden documents render in. No dev server, no disk writes, no port races.
//
// The fonts are the harness's business because a golden records laid-out
// shape: a face that comes from the host is a measurement that changes
// machine to machine. See fonts.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import { build as esbuildBuild } from 'esbuild';

import {
  bundledFonts,
  faceSpecCSS,
  GOLDEN_BODY_STACK,
  KATEX_FAMILIES,
  katexFaces,
  katexFonts,
  type FaceSpec,
} from './fonts.js';
import { katexLayoutCSS } from '../css-builder.js';
import type { OutlineEntry } from '../paginator.js';
import type { DocumentSettings } from '../settings.js';

// esbuild bundles core's source for the page. It's a direct devDependency
// here (the same tool tsup uses for the dist build); importing it directly
// keeps the harness independent of tsup's internal dependency layout.
const SRC_DIR = fileURLToPath(new URL('..', import.meta.url)); // …/packages/core/src/

const ORIGIN = 'https://golden.local';

// ─── Browser lifecycle ────────────────────────────────────────────────────────

let browser: Browser | undefined;
/** The one page, behind a promise so concurrent callers share the single
 *  instance rather than racing to open a second one — the fonts are
 *  installed on it before it is handed out, and a caller that slipped in
 *  mid-install would measure against fallbacks. */
let pagePromise: Promise<Page> | undefined;

/** Node-side registry of served modules: routes read from it, tests (still
 *  Node-side) write to it. Lives in the harness module, not the page. */
const servedFiles = new Map<string, string | Buffer>();

export async function getPage(): Promise<Page> {
  pagePromise ??= openPage();
  return await pagePromise;
}

async function openPage(): Promise<Page> {
  browser ??= await chromium.launch();
  const context = await browser.newContext();
  const p = await context.newPage();

  // Serve the in-memory registry and the bundled fonts at the fictional
  // origin: no dev server, no port races — Chromium never talks to a real
  // network. Only the fonts come off disk, and only when asked for.
  await p.route(`${ORIGIN}/**`, async (route) => {
    const name = new URL(route.request().url()).pathname;
    const body = servedFiles.get(name) ?? (await fontBytes(name));
    if (body === undefined) {
      return route.fulfill({ status: 404, body: `no such file ${name}` });
    }
    return route.fulfill({ contentType: contentTypeFor(name), body });
  });

  await p.goto(`${ORIGIN}/`);
  await installFonts(p);
  return p;
}

/** Shuts the shared browser down. Call from afterAll. */
export async function closeBrowser(): Promise<void> {
  const page = pagePromise
    ? await pagePromise.catch(() => undefined)
    : undefined;
  pagePromise = undefined;
  await page?.close().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  browser = undefined;
}

// ─── Served files ─────────────────────────────────────────────────────────────

/** Response types for what the route serves. Fonts must not go out labelled
 *  as JavaScript: same-origin, so CORS is not the issue, but the response
 *  still has to say what it carries. */
const CONTENT_TYPES: Record<string, string> = {
  '.js': 'application/javascript',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

function contentTypeFor(name: string): string {
  const dot = name.lastIndexOf('.');
  const ext = dot === -1 ? '' : name.slice(dot);
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

const bundled = once(() => bundledFonts(ORIGIN));
const katex = once(() => katexFonts());

/** Served name → absolute path, for everything under /fonts/. */
let fontIndex: Map<string, string> | undefined;
/** Bytes already read, so a face used by twenty pages is read once. */
const fontBytesCache = new Map<string, Buffer>();

/** The bytes of a served font, or undefined when the name is not one the
 *  suite ships (which the route turns into a 404). */
async function fontBytes(name: string): Promise<Buffer | undefined> {
  fontIndex ??= new Map([...(await bundled()).files, ...(await katex())]);
  const path = fontIndex.get(name.slice(name.lastIndexOf('/') + 1));
  if (path === undefined) return undefined;

  let bytes = fontBytesCache.get(path);
  if (bytes === undefined) {
    bytes = await readFile(path);
    fontBytesCache.set(path, bytes);
  }
  return bytes;
}

/** Registers every face the golden documents can reach on the page, and
 *  waits for them. Pagination measures real layout, so a face that swaps in
 *  after the measurement would be measured as its fallback —
 *  `document.fonts.ready` alone does not cover this, because a face no
 *  rendered text has asked for yet is not pending. Each one is loaded
 *  explicitly first, and a face that yields nothing is a hard failure: it
 *  means a url or a family name has drifted, and the alternative is a golden
 *  diff that reads like an engine regression.
 *
 *  Both stylesheets go in: the bundled faces, and `katex.css` — which the
 *  app loads at the document level too. Its faces have to be registered even
 *  though the pagination sandbox gets no stylesheet, because the golden body
 *  stacks name them (see fonts.ts). */
async function installFonts(p: Page): Promise<void> {
  const [{ css, faces }, mathSheet] = [await bundled(), await mathCSS()];
  const mathFaces = katexFaces(mathSheet);
  assertKatexFamilies(mathFaces);

  await p.addStyleTag({ content: css });
  await p.addStyleTag({ content: mathSheet });

  const specs = [...faces, ...mathFaces].map((face) => faceSpecCSS(face));
  await p.evaluate(async (specs) => {
    const loaded = await Promise.all(
      specs.map((spec) => document.fonts.load(spec)),
    );
    const missing = specs.filter((_, i) => loaded[i]!.length === 0);
    if (missing.length > 0) {
      throw new Error(`bundled fonts did not load: ${missing.join(', ')}`);
    }
    await document.fonts.ready;
  }, specs);
}

/** The golden body stacks name KaTeX's families, so that list has to match
 *  the stylesheet the package ships. A rename or an addition there would
 *  otherwise leave a family the stack claims and nothing provides — a silent
 *  host fallback, which is the defect this whole module exists to prevent. */
function assertKatexFamilies(faces: FaceSpec[]): void {
  const declared = [...new Set(faces.map((f) => f.family))].sort();
  const named = [...KATEX_FAMILIES].sort();
  if (declared.join('\u0000') !== named.join('\u0000')) {
    throw new Error(
      'katex.css declares different families than fonts.ts names:\n' +
        `  declared: ${declared.join(', ')}\n` +
        `  named:    ${named.join(', ')}`,
    );
  }
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
    entryPoints: [join(SRC_DIR, 'golden/mermaid.ts')],
    bundle: true,
    format: 'esm',
    write: false,
    platform: 'browser',
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

/** The suite's own mermaid renderer URL (its own bundle — mermaid itself is
 *  huge and only the math+mermaid golden document needs it). It pins the
 *  diagram's font family; see golden/mermaid.ts. */
export async function mermaidURL(): Promise<string> {
  return await serveBundle('mermaid.js', await mermaidBundle());
}

/** The KaTeX stylesheet text, exactly as core ships it. */
export async function mathCSS(): Promise<string> {
  return await katexCSS();
}

/** The layout half of `katex.css`: everything from its first `.katex` rule
 *  on. That is what the app adopts into its page shadow roots and what its
 *  pipeline paginates against, and the app takes the same slice through the
 *  same helper — the block before it is `@font-face`, and a shadow-level copy
 *  would resolve those `url(fonts/…)` against the host root rather than the
 *  served origin. */
export async function mathLayoutCSS(): Promise<string> {
  return katexLayoutCSS(await katexCSS());
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

/** In-page source: every element in the laid-out export document whose
 *  primary font family is a generic keyword. */
const FIND_GENERIC_FONTS = /* js */ `
  ({ exportHTML }) => {
    const GENERIC = new Set([
      'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
      'math', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
    ]);
    const host = document.createElement('div');
    host.innerHTML = exportHTML;
    document.body.appendChild(host);

    // Boxes clipped to nothing are off the page in every sense that matters
    // here: KaTeX's accessibility MathML branch is a 1px absolute box with
    // overflow hidden, so its own 'math' family is never rendered. Anything
    // inside such a box is skipped rather than reported.
    const clipped = new Set();
    for (const el of host.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') {
        clipped.add(el);
      } else if (cs.position === 'absolute' || cs.position === 'fixed') {
        const r = el.getBoundingClientRect();
        if (r.width <= 4 || r.height <= 4) clipped.add(el);
      }
    }
    const isClipped = (el) => {
      for (let p = el; p && p !== host; p = p.parentElement) {
        if (clipped.has(p)) return true;
      }
      return false;
    };

    const found = [];
    for (const el of host.querySelectorAll('*')) {
      if (isClipped(el)) continue;
      const list = getComputedStyle(el).fontFamily;
      const first = list.split(',')[0].trim().replace(/^["']|["']$/g, '');
      if (GENERIC.has(first.toLowerCase())) {
        found.push(el.tagName + ' { font-family: ' + list + ' }');
      }
    }
    host.remove();
    return found;
  }
`;

/** Elements of the laid-out export document whose primary font family is a
 *  generic keyword, as `TAG { font-family: … }` strings.
 *
 *  A generic keyword is answered by the host, not by the document, so an
 *  element sitting on one measures whatever that machine happens to have —
 *  which is how this suite came to pass on one machine and fail on another
 *  twice over: `pre` takes `monospace` from the UA stylesheet unless a rule
 *  says otherwise, and the pagination sandbox left MathML on `math`. Both
 *  were real defects, both are fixed, and this is what keeps them fixed.
 *
 *  Only the *primary* family is checked. A generic at the end of a list is
 *  ordinary CSS — `katex.css` writes `KaTeX_Main, "Times New Roman", serif`
 *  itself, and the leading family is a bundled one. What this does not catch
 *  is a named family the suite does not ship; the font-independence
 *  procedure in golden/README.md is the check for that. */
export async function genericFontElements(
  exportHTML: string,
): Promise<string[]> {
  const p = await getPage();
  return await p.evaluate(
    `(${FIND_GENERIC_FONTS})(${JSON.stringify({ exportHTML })})`,
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
      ? (await import(modules.mermaid)).createMermaidRenderer(modules.mermaidFont)
      : undefined;

    const isRTL = core.isRTLContent(markdown);
    const docCSS = core.buildDocCSS(settings, isRTL);
    const geometry = core.resolvePageGeometry(settings);
    // Math layout rules first, then the content rules — what the app's
    // pipeline paginates against, and the order the preview's shadow roots
    // and the export document both use.
    const paginateCSS = options.mathLayoutCSS + '\\n' + docCSS;

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
          container, geometry.contentW, geometry.contentH, paginateCSS,
        ),
      );
    }
    if (allPages.length === 0) allPages.push([]);

    const layouts = core.buildPageLayouts(allPages, settings, options.title);
    const outline = core.extractOutlineEntries(layouts);
    const exportHTML = core.buildExportHTML(
      layouts, settings, () => undefined,
      {
        title: options.title,
        isRTL,
        mathCSS: options.mathCSS ?? '',
        // The export document carries its own faces, the way the real one
        // does (billing/05). The page has them too, for the pagination
        // sandbox — which runs long before this document exists.
        fontFaceCSS: options.fontFaceCSS ?? '',
      },
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
  const [engine, mermaid, math, layout, fonts] = [
    await engineURL(),
    options.renderMermaid ? await mermaidURL() : undefined,
    options.includeMathCSS === false ? undefined : await mathCSS(),
    await mathLayoutCSS(),
    (await bundled()).css,
  ];

  const payload = {
    modules: {
      engine,
      mermaid,
      // The suite's sans, which is the closest bundled stand-in for the
      // family mermaid defaults to. The app deliberately keeps mermaid's
      // default rather than following the Document's typography — that is
      // its decision and this pin does not touch it; it only stops the
      // diagram's size from being whatever the host has installed.
      mermaidFont: GOLDEN_BODY_STACK.sans,
    },
    markdown,
    settings,
    options: {
      title: options.title ?? 'Golden',
      mathCSS: math,
      mathLayoutCSS: options.includeMathCSS === false ? '' : layout,
      fontFaceCSS: fonts,
    },
  };

  return (await p.evaluate(
    `(${RUN_PIPELINE})(${JSON.stringify(payload)})`,
  )) as GoldenResult & {
    violations: OverflowViolation[];
  };
}
