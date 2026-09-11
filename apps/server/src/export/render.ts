// ─────────────────────────────────────────────────────────────────────────────
// The real Server Export render seam (server/03, ADR-0003).
//
// One Chromium for the process, one context per job. The render drives the
// app's own /export page — the same pipeline the preview and Client Export
// run — through a three-step handshake:
//
//   1. the page sets `__pmdExportReady` once its message listener is attached;
//   2. the worker posts the payload (document + settings + data:-URI assets)
//      via window.postMessage;
//   3. the page paints the export document, waits for its webfonts, and
//      calls `__pmdExportDone(result)` — installed here with exposeFunction.
//
// Then Page.pdf() prints exactly what the preview showed (preferCSSPageSize
// honors the settings' @page size, printBackground keeps banners and page
// colors), and injectPDFOutline adds the bookmarks Chromium's print pipeline
// never writes. Field names are the wire contract with
// apps/web/src/export/protocol.ts; render.e2e.test.ts drives both ends.
// ─────────────────────────────────────────────────────────────────────────────

import { injectPDFOutline, type OutlineEntry } from '@perfectmarkd/core';
import type { Browser } from 'playwright';
import { RenderError, type RenderPdf } from './worker.js';

const DONE_FUNCTION_NAME = '__pmdExportDone';
const READY_FLAG_NAME = '__pmdExportReady';

/** Upper bound on outline entries accepted from the page. */
const MAX_OUTLINE_ENTRIES = 10_000;

type PageRenderResult =
  | { ok: true; outline: OutlineEntry[]; pageCount: number }
  | { ok: false; errorCode: string; message: string };

export interface PlaywrightRenderOptions {
  /** Where /export lives — the web dev server, or the same origin in prod. */
  origin: string;
  /** Deadline for the whole render (handshake, page run, and Page.pdf). */
  timeoutMs?: number;
}

export interface PlaywrightRenderer {
  renderPdf: RenderPdf;
  /** Shuts the shared browser down (tests; process exit covers production). */
  close(): Promise<void>;
}

/**
 * Builds the default render seam. Importing playwright and launching
 * Chromium happen on the first render, never at app construction —
 * unit-test apps build the worker without touching a browser.
 */
export function createPlaywrightRenderer(
  options: PlaywrightRenderOptions,
): PlaywrightRenderer {
  const timeoutMs = options.timeoutMs ?? 120_000;
  let browserPromise: Promise<Browser> | null = null;

  async function renderPdf(payload: Parameters<RenderPdf>[0]) {
    const { chromium } = await import('playwright');
    browserPromise ??= chromium
      .launch()
      .catch((error: unknown) => {
        // A failed launch must not poison every later render.
        browserPromise = null;
        throw error;
      });
    const browser = await browserPromise;
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      const result = await runInPage(page, options.origin, payload, timeoutMs);
      if (!result.ok) {
        throw new RenderError('render_failed', result.message);
      }
      const pdf = await page.pdf({
        preferCSSPageSize: true,
        printBackground: true,
      });
      const outlined = await injectPDFOutline(pdf, result.outline);
      return { pdf: outlined, pages: result.pageCount };
    } catch (error) {
      if (error instanceof RenderError) throw error;
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new RenderError('render_timeout', 'The export timed out.');
      }
      throw new RenderError(
        'render_failed',
        error instanceof Error ? error.message : 'Unknown render error.',
      );
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  return {
    renderPdf,
    close: async () => {
      const browser = await browserPromise?.catch(() => null);
      await browser?.close().catch(() => undefined);
      browserPromise = null;
    },
  };
}

/** The handshake: install the done-callback, load /export, wait for the
 *  page's listener, post the payload, await the render result. The evaluated
 *  functions run in the page, so the message type and flag names are
 *  inlined — module scope does not cross into the browser. */
async function runInPage(
  page: import('playwright').Page,
  origin: string,
  payload: unknown,
  timeoutMs: number,
): Promise<PageRenderResult> {
  let settleDone!: (result: PageRenderResult) => void;
  const done = new Promise<PageRenderResult>((resolve) => {
    settleDone = resolve;
  });

  await page.exposeFunction(DONE_FUNCTION_NAME, (raw: unknown) => {
    settleDone(parseResult(raw));
  });

  await page.goto(`${origin}/export`, { waitUntil: 'load' });
  await page.waitForFunction(
    /* jshint ignore:start */
    (flag: string) =>
      (window as unknown as Record<string, unknown>)[flag] === true,
    READY_FLAG_NAME,
    { timeout: timeoutMs },
  );

  await page.evaluate(
    (p: unknown) => {
      window.postMessage(
        { type: 'pmd:export-render' as const, payload: p },
        window.location.origin,
      );
    },
    payload,
  );

  const timeout = setTimeout(() => {
    settleDone({
      ok: false,
      errorCode: 'render_timeout',
      message: 'The export page did not finish rendering in time.',
    });
  }, timeoutMs);
  try {
    return await done;
  } finally {
    clearTimeout(timeout);
  }
}

/** Structural validation of the page's result — it crossed a browser
 *  boundary, so it is untrusted input like anything else. */
function parseResult(raw: unknown): PageRenderResult {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, errorCode: 'render_failed', message: 'Bad render result.' };
  }
  const record = raw as Record<string, unknown>;
  if (record.ok === false) {
    return {
      ok: false,
      errorCode:
        typeof record.errorCode === 'string' ? record.errorCode : 'render_failed',
      message: typeof record.message === 'string' ? record.message : 'Render failed.',
    };
  }
  const pageCount = record.pageCount;
  if (typeof pageCount !== 'number' || !Number.isInteger(pageCount) || pageCount < 1) {
    return {
      ok: false,
      errorCode: 'render_failed',
      message: 'The export page reported no page count.',
    };
  }
  if (!Array.isArray(record.outline)) {
    return {
      ok: false,
      errorCode: 'render_failed',
      message: 'The export page reported no outline.',
    };
  }
  const outline: OutlineEntry[] = [];
  for (const entry of record.outline.slice(0, MAX_OUTLINE_ENTRIES)) {
    const e = parseOutlineEntry(entry);
    if (e) outline.push(e);
  }
  return { ok: true, pageCount, outline };
}

function parseOutlineEntry(raw: unknown): OutlineEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const { title, level, page } = record;
  return {
    title: typeof title === 'string' ? title : '',
    level:
      typeof level === 'number' && Number.isInteger(level) && level >= 1 && level <= 6
        ? level
        : 6,
    page:
      typeof page === 'number' && Number.isInteger(page) && page >= 1 ? page : 1,
  };
}
