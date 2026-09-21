// ─────────────────────────────────────────────────────────────────────────────
// End-to-end Server Export render (server/03): real Chromium, the real wire
// protocol, the real pipeline, Page.pdf(), and outline injection.
//
// The web app's /export route is a React surface, so this suite serves a
// minimal fixture page that mounts the REAL protocol module
// (apps/web/src/export/protocol.ts), bundled with esbuild exactly like the
// engine's golden harness bundles core. A local HTTP server (the pattern the
// web E2E suite uses) serves the fixture, the bundle, and KaTeX's fonts, so
// the worker's Chromium navigates a genuine origin. Runs under its own
// vitest config (playwright.vitest.config.ts) because it needs Playwright's
// browser — the root suite stays browser-independent.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile, readdir } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib';
import { build as esbuildBuild } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type DocumentSettings } from '@perfectmarkd/core';

import { createTestDatabase, removeTestDatabase } from '../db/testing.js';
import type { AppDatabase } from '../db/database.js';
import { exportJobs, users, type ExportJob, type Plan } from '../db/schema.js';
import { PayloadStore, ResultStore, insertExportJob } from './queue.js';
import { createPlaywrightRenderer } from './render.js';
import { ExportWorker } from './worker.js';

const REPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const WEB_SRC = join(REPO_ROOT, 'apps/web/src');
const CORE_SRC = join(REPO_ROOT, 'packages/core/src');
const KATEX_FONTS = join(
  REPO_ROOT,
  'packages/core/node_modules/katex/dist/fonts',
);

const TIMEOUT_MS = 30_000;

// ─── Fixture serving ──────────────────────────────────────────────────────────

type File = { body: string | Buffer; type: string };

async function startFixtureServer(
  files: Record<string, File>,
): Promise<{ origin: string; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    const file = files[path];
    if (!file) {
      res.writeHead(404).end(`no such file ${path}`);
      return;
    }
    res.writeHead(200, { 'content-type': file.type });
    res.end(file.body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

/** The fixture page: the same handshake ExportPage.tsx implements, minus
 *  React and IndexedDB — the math stylesheet arrives as its own module. */
const FIXTURE_HTML = `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>export fixture</title></head>
  <body>
    <script type="module">
      import {
        renderServerExportDocument,
        EXPORT_READY_FLAG,
        EXPORT_DONE_FUNCTION,
        EXPORT_RENDER_MESSAGE,
      } from '/protocol.js';
      import MATH_CSS from '/math-css.js';

      window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.type !== EXPORT_RENDER_MESSAGE) return;
        void renderServerExportDocument(data.payload, { mathCSS: MATH_CSS }).then(
          (result) => {
            window[EXPORT_DONE_FUNCTION]?.(result);
          },
        );
      });
      window[EXPORT_READY_FLAG] = true;
    </script>
  </body>
</html>`;

// ─── Shared fixture state ─────────────────────────────────────────────────────

const mathCSS = await readFile(
  join(REPO_ROOT, 'packages/core/node_modules/katex/dist/katex.min.css'),
  'utf8',
);

const protocolBundle = await esbuildBuild({
  entryPoints: [join(WEB_SRC, 'export/protocol.ts')],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'browser',
  alias: { '@perfectmarkd/core': join(CORE_SRC, 'index.ts') },
  define: { 'process.env.NODE_ENV': '"production"' },
});

const payload = {
  title: 'E2E Doc',
  markdown:
    '# First\n\nSome text with $x^2$ math.\n\n///\n\n# Second\n\nMore text.\n',
  settings: {
    ...DEFAULT_SETTINGS,
    // A custom font end to end (billing/05): the fixture page must register
    // it as a FontFace before paginating and embed it for Page.pdf. IBM
    // Plex Mono's internal name is distinctive in the PDF's font table
    // (Chromium names embedded fonts by the file's PostScript name, not
    // the CSS family alias).
    fontFamily: '__custom__',
    customFontName: 'E2ECustomFont',
  } as DocumentSettings,
  pageCount: 2,
  assets: {},
  fonts: {
    E2ECustomFont: `data:font/woff2;base64,${(
      await readFile(
        join(
          REPO_ROOT,
          'apps/web/node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2',
        ),
      )
    ).toString('base64')}`,
  },
};

const FONT_TYPES: Record<string, string> = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

async function fixtureFiles(): Promise<Record<string, File>> {
  const files: Record<string, File> = {
    '/export': { body: FIXTURE_HTML, type: 'text/html' },
    '/protocol.js': {
      body: protocolBundle.outputFiles[0]!.text,
      type: 'application/javascript',
    },
    '/math-css.js': {
      body: `export default ${JSON.stringify(mathCSS)};`,
      type: 'application/javascript',
    },
  };
  // KaTeX's font files, so math renders with real faces instead of fallbacks.
  for (const name of await readdir(KATEX_FONTS)) {
    const type = FONT_TYPES[name.slice(name.lastIndexOf('.'))];
    if (!type) continue;
    files[`/fonts/${name}`] = {
      body: await readFile(join(KATEX_FONTS, name)),
      type,
    };
  }
  return files;
}

let cleanupDb: (() => void) | undefined;
let fixture: { origin: string; close: () => Promise<void> };
let blankFixture: { origin: string; close: () => Promise<void> };
let renderer: ReturnType<typeof createPlaywrightRenderer>;

async function makeUser(db: AppDatabase): Promise<number> {
  const [row] = await db
    .insert(users)
    .values({ email: `e2e-${Math.random()}@test.dev`, passwordHash: 'x' })
    .returning();
  return row!.id;
}

beforeAll(async () => {
  fixture = await startFixtureServer(await fixtureFiles());
  // A second origin whose /export never becomes ready — for the timeout path.
  blankFixture = await startFixtureServer({
    '/export': {
      body: '<!doctype html><html><head><title>stuck</title></head><body></body></html>',
      type: 'text/html',
    },
  });
  renderer = createPlaywrightRenderer({
    origin: fixture.origin,
    timeoutMs: TIMEOUT_MS,
  });
});

afterAll(async () => {
  await renderer.close();
  await fixture.close();
  await blankFixture.close();
  cleanupDb?.();
});

/** Waits for the job row to settle (better-sqlite3 reads share the worker's
 *  synchronous writes; only the async render takes time). */
async function pollJob(db: AppDatabase, id: string): Promise<ExportJob> {
  const started = Date.now();
  for (;;) {
    const row = db
      .select()
      .from(exportJobs)
      .all()
      .find((candidate) => candidate.id === id);
    if (row && (row.status === 'done' || row.status === 'failed')) return row;
    if (Date.now() - started > TIMEOUT_MS) throw new Error('job never settled');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function enqueueJob(
  db: AppDatabase,
  id: string,
  payloads: PayloadStore,
): Promise<void> {
  const userId = await makeUser(db);
  insertExportJob(db, { id, userId, plan: 'pro' as Plan, now: new Date() });
  payloads.hold(id, payload);
}

describe('Server Export end-to-end (real Chromium)', () => {
  it('renders through the /export page: queued job → PDF with pages, title, and outline', async () => {
    const { db, dir } = createTestDatabase();
    cleanupDb = () => removeTestDatabase(dir);

    const payloads = new PayloadStore();
    const results = new ResultStore();
    const worker = new ExportWorker({
      db,
      payloads,
      results,
      renderPdf: renderer.renderPdf,
    });
    worker.start();

    await enqueueJob(db, 'e2e-1', payloads);
    worker.notify();

    const done = await pollJob(db, 'e2e-1');
    expect(done.status).toBe('done');
    expect(done.pages).toBe(2);
    // The ticket's "payload deleted (test asserts)" — in the real path.
    expect(payloads.size).toBe(0);

    const pdf = results.get('e2e-1')!;
    // A PDF, two pages, and the document title Chromium carried into the
    // PDF's metadata from the export document's <title>.
    expect(pdf[0]).toBe(0x25); // "%"
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getTitle()).toBe('E2E Doc');
    // injectPDFOutline ran: the catalog carries an Outlines dict.
    expect(doc.catalog.get(PDFName.of('Outlines'))).toBeDefined();
    // The payload's custom font made it into the print (billing/05): the
    // page resources reference the font file's PostScript name.
    const baseFonts: string[] = [];
    for (const [, obj] of doc.context.enumerateIndirectObjects()) {
      if (
        obj instanceof PDFDict &&
        obj.get(PDFName.of('Type')) === PDFName.of('Font') &&
        obj.get(PDFName.of('BaseFont'))
      ) {
        baseFonts.push(String(obj.get(PDFName.of('BaseFont'))));
      }
    }
    expect(baseFonts.some((name) => name.includes('IBMPlexMono'))).toBe(true);
    worker.stop();
  });

  it('fails a job that never renders with the typed render_timeout code', async () => {
    const stuck = createPlaywrightRenderer({
      origin: blankFixture.origin,
      timeoutMs: 500,
    });
    try {
      const { db, dir } = createTestDatabase();
      cleanupDb?.();
      cleanupDb = () => removeTestDatabase(dir);

      const payloads = new PayloadStore();
      const results = new ResultStore();
      const worker = new ExportWorker({
        db,
        payloads,
        results,
        renderPdf: stuck.renderPdf,
      });
      worker.start();

      await enqueueJob(db, 'e2e-timeout', payloads);
      worker.notify();

      const failed = await pollJob(db, 'e2e-timeout');
      expect(failed.status).toBe('failed');
      expect(failed.errorCode).toBe('render_timeout');
      expect(payloads.size).toBe(0);
      expect(results.size).toBe(0);
      worker.stop();
    } finally {
      await stuck.close();
    }
  });
});
