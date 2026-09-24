// ─────────────────────────────────────────────────────────────────────────────
// The real Server Export render seam (server/03, ADR-0003).
//
// One Chromium for the process and a pool of contexts behind it (launch/05):
// a job checks a context out, drives the app's own /export page through a
// three-step handshake, prints, and hands the context back.
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
//
// The whole job runs under one deadline (launch/05, default 60 s): every step
// gets what is left of the budget and the print is bounded with it, so a
// wedged render frees its queue slot as a typed render_timeout instead of
// holding it forever.
// ─────────────────────────────────────────────────────────────────────────────

import { injectPDFOutline, type OutlineEntry } from '@perfectmarkd/core';
import type { Browser, BrowserContext } from 'playwright';
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
  /** Deadline for one job, start to finish: the handshake, the page's own
   *  render, and Page.pdf(). Defaults to 60 s (launch/05). */
  timeoutMs?: number;
}

export interface PlaywrightRenderer {
  renderPdf: RenderPdf;
  /** Shuts the pooled contexts and the shared browser down (tests; process
   *  exit covers production). */
  close(): Promise<void>;
}

/** Remaining budget, floored at 1 ms: Playwright treats 0 as "no timeout",
 *  which is the opposite of what an expired deadline means. */
function remainingMs(deadline: number): number {
  return Math.max(1, deadline - Date.now());
}

/**
 * Runs `work` under `ms`, cancelling it through `cancel` when the budget runs
 * out. Used for the print step, which Playwright will otherwise wait on
 * indefinitely — there is no timeout option on Page.pdf().
 */
async function withDeadline<T>(
  work: Promise<T>,
  ms: number,
  cancel: () => Promise<void>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      void cancel().catch(() => undefined);
      reject(new RenderError('render_timeout', 'The export timed out.'));
    }, ms);
  });
  try {
    return await Promise.race([work, expired]);
  } finally {
    if (timer) clearTimeout(timer);
    // The loser keeps running after the race is decided: cancelling the print
    // makes it reject a moment later with nobody left to catch it.
    void work.catch(() => undefined);
  }
}

/**
 * Builds the default render seam. Importing playwright and launching
 * Chromium happen on the first render, never at app construction —
 * unit-test apps build the worker without touching a browser.
 *
 * One browser and a pool of contexts serve the process (launch/05): a launch
 * is ~100 ms and a context ~10 ms, and the worker's concurrency is the pool's
 * ceiling, so a burst of exports reuses the warm contexts instead of paying
 * for a fresh one each time. A context that fails is discarded rather than
 * returned — a browser that just crashed is not a browser to hand to the next
 * job.
 */
export function createPlaywrightRenderer(
  options: PlaywrightRenderOptions,
): PlaywrightRenderer {
  const timeoutMs = options.timeoutMs ?? 60_000;
  let browserPromise: Promise<Browser> | null = null;
  /** Idle contexts, at most one per concurrent render. */
  const idleContexts: BrowserContext[] = [];

  async function acquireContext(deadline: number): Promise<BrowserContext> {
    const pooled = idleContexts.pop();
    if (pooled) return pooled;
    const { chromium } = await import('playwright');
    // The launch is inside the job's budget too. The promise is shared, so the
    // first caller's budget governs it; a launch that times out clears the
    // cache, and the next job retries with its own.
    browserPromise ??= chromium
      .launch({ timeout: remainingMs(deadline) })
      .catch((error: unknown) => {
        // A failed launch must not poison every later render.
        browserPromise = null;
        throw error;
      });
    const browser = await browserPromise;
    return browser.newContext();
  }

  async function renderPdf(payload: Parameters<RenderPdf>[0]) {
    // One deadline for the whole job: the browser launch, the handshake, the
    // page's own render, and the print all draw on the same budget, and the
    // print — the one step Playwright would otherwise let run forever — is
    // cancelled when it runs out.
    const deadline = Date.now() + timeoutMs;
    const context = await acquireContext(deadline);
    let reusable = true;
    const page = await context.newPage();
    try {
      const result = await runInPage(
        page,
        options.origin,
        payload,
        remainingMs(deadline),
      );
      if (!result.ok) {
        // The page reports its own timeout as a typed code; carrying it
        // through is the whole point of the handshake's error channel —
        // mapping everything to render_failed would lose the distinction the
        // job row and the client both read.
        throw new RenderError(
          result.errorCode === 'render_timeout'
            ? 'render_timeout'
            : 'render_failed',
          result.message,
        );
      }
      const pdf = await withDeadline(
        page.pdf({ preferCSSPageSize: true, printBackground: true }),
        remainingMs(deadline),
        // Page.pdf() takes no timeout of its own, so an expired budget is
        // enforced by pulling the page out from under the print: the
        // in-flight protocol call rejects, which is what this returns.
        () => page.close(),
      );
      const outlined = await injectPDFOutline(pdf, result.outline);
      return { pdf: outlined, pages: result.pageCount };
    } catch (error) {
      reusable = false;
      if (error instanceof RenderError) throw error;
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new RenderError('render_timeout', 'The export timed out.');
      }
      throw new RenderError(
        'render_failed',
        error instanceof Error ? error.message : 'Unknown render error.',
      );
    } finally {
      // The page always goes: it is cheap and it holds the handshake. The
      // context only goes back to the pool when the job did not fail — after
      // a timeout or a crash its state is not worth trusting.
      await page.close().catch(() => undefined);
      if (reusable) idleContexts.push(context);
      else await context.close().catch(() => undefined);
    }
  }

  return {
    renderPdf,
    close: async () => {
      await Promise.all(
        idleContexts
          .splice(0)
          .map((context) => context.close().catch(() => undefined)),
      );
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

  await page.evaluate((p: unknown) => {
    window.postMessage(
      { type: 'pmd:export-render' as const, payload: p },
      window.location.origin,
    );
  }, payload);

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
    return {
      ok: false,
      errorCode: 'render_failed',
      message: 'Bad render result.',
    };
  }
  const record = raw as Record<string, unknown>;
  if (record.ok === false) {
    return {
      ok: false,
      errorCode:
        typeof record.errorCode === 'string'
          ? record.errorCode
          : 'render_failed',
      message:
        typeof record.message === 'string' ? record.message : 'Render failed.',
    };
  }
  const pageCount = record.pageCount;
  if (
    typeof pageCount !== 'number' ||
    !Number.isInteger(pageCount) ||
    pageCount < 1
  ) {
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
      typeof level === 'number' &&
      Number.isInteger(level) &&
      level >= 1 &&
      level <= 6
        ? level
        : 6,
    page:
      typeof page === 'number' && Number.isInteger(page) && page >= 1
        ? page
        : 1,
  };
}
