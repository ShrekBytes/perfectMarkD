// ─────────────────────────────────────────────────────────────────────────────
// Client Export (ADR-0002): the document goes out through the browser's own
// print pipeline — free, unmetered, no account. Three parts:
//
// - buildExportDocument runs the same engine pipeline as the Paper Canvas
//   (pipeline.ts) and hands the layouts to the engine's buildExportHTML, so
//   the print document is by construction the layout the preview showed —
//   same geometry, doc CSS, RTL decision, and now the FULL KaTeX stylesheet
//   (fonts included) because the print document is a self-contained document,
//   not a shadow tree riding the app's registered fonts.
//
// - printViaHiddenIframe writes that document into a hidden iframe and calls
//   print() on its window. The user picks "Save as PDF" in the dialog; the
//   Chromium print-to-PDF is the same engine the server path uses, so free
//   and paid output are identical (PLAN.md tiering).
//
// - The small environment probes the flow needs: which browser is printing
//   (the @page-quirk notice) and whether the session hint was shown.
// ─────────────────────────────────────────────────────────────────────────────

import { buildExportHTML, type DocumentSettings } from '@perfectmarkd/core';
import { createAssetResolver } from '../assets/resolver';
import { KATEX_EXPORT_CSS } from '../canvas/katex-css';
import { collectAssetRefs, runDocumentPipeline } from '../canvas/pipeline';
import { openDatabase } from '../documents/db';

/**
 * Builds the standalone print HTML for the given document state.
 * Throws when the engine run fails; callers surface that as an export error.
 */
export async function buildExportDocument(
  markdown: string,
  settings: DocumentSettings,
  title: string,
): Promise<string> {
  const assets = createAssetResolver(await openDatabase(), 'data-uri');
  try {
    await assets.warmup(collectAssetRefs(markdown, settings));
    const result = await runDocumentPipeline(markdown, settings, { title });

    // Markdown images keep their asset:// refs through the render (the
    // resolver is the host's concern, not renderMarkdown's); the export
    // document must be self-contained, so swap in the warmed data: URIs.
    // A ref the store can't resolve drops the image, matching how the
    // banner/background layers treat unresolvable refs (ticket 08's notes).
    for (const layout of result.layouts) {
      for (const node of layout.pageNodes) {
        for (const img of node.querySelectorAll('img[src^="asset://"]')) {
          const resolved = assets(img.getAttribute('src')!);
          if (resolved) img.setAttribute('src', resolved);
          else img.remove();
        }
      }
    }

    return buildExportHTML(result.layouts, settings, assets, {
      title,
      mathCSS: KATEX_EXPORT_CSS,
      isRTL: result.isRTL,
    });
  } finally {
    assets.dispose();
  }
}

/** Safety net: how long to wait for the frame's document to parse before
 *  printing anyway (and for webfonts before that). Real browsers parse an
 *  srcdoc document within a few ticks; the generous default only matters if
 *  something went wrong. jsdom never parses srcdoc at all, so tests shrink
 *  this via setPrintLoadTimeoutForTests. */
const DEFAULT_LOAD_TIMEOUT_MS = 5000;
let loadTimeoutMs = DEFAULT_LOAD_TIMEOUT_MS;

/** Test hook: jsdom never parses srcdoc content, so every wait would run the
 *  full deadline. Tests shrink it to keep the suite fast. */
export function setPrintLoadTimeoutForTests(ms: number): void {
  loadTimeoutMs = ms;
}

export const delay = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Marks the point in the export markup where the document is fully parsed:
 *  printViaHiddenIframe polls for it inside the frame instead of relying on
 *  the iframe load event, which fires early (about:blank) or not at all
 *  (jsdom) depending on the environment. display:none, no print effect. */
const SENTINEL_ATTR = 'data-pm-print-ready';

function withPrintSentinel(html: string): string {
  const marker = `<div ${SENTINEL_ATTR} style="display:none"></div>`;
  // lastIndexOf: content text is serialized escaped, so the document's own
  // closing tag is the literal occurrence.
  const bodyEnd = html.lastIndexOf('</body>');
  return bodyEnd === -1
    ? html + marker
    : `${html.slice(0, bodyEnd)}${marker}${html.slice(bodyEnd)}`;
}

/**
 * Prints `html` through a hidden iframe: the only content the print pipeline
 * ever sees is this document, so no app UI can leak into the output. Resolves
 * once the print dialog has been invoked and the frame is removed again.
 */
export async function printViaHiddenIframe(html: string): Promise<void> {
  const iframe = document.createElement('iframe');
  // Off-screen but rendered: display:none frames don't print reliably, and a
  // visible frame would flash the document behind the dialog.
  iframe.setAttribute('aria-hidden', 'true');
  iframe.title = '';
  iframe.style.cssText =
    'position:fixed;right:100%;bottom:100%;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';
  iframe.srcdoc = withPrintSentinel(html);

  const timeoutMs = loadTimeoutMs;
  const startedAt = Date.now();

  document.body.appendChild(iframe);
  try {
    // Wait until the export markup has actually parsed inside the frame.
    while (
      !iframe.contentDocument?.querySelector(`[${SENTINEL_ATTR}]`) &&
      Date.now() - startedAt < timeoutMs
    ) {
      await delay(5);
    }

    const win = iframe.contentWindow;
    if (!win) throw new Error('Print iframe exposed no content window.');
    // Let the frame's webfonts (KaTeX) finish so math prints with the
    // preview's faces; settles immediately when nothing is loading. A fresh
    // budget of its own: parse must not have consumed it already.
    const fonts = win.document?.fonts;
    if (fonts) await Promise.race([fonts.ready, delay(timeoutMs)]);

    win.focus();
    win.print();
  } finally {
    // print() blocks until the dialog closes in Chrome/Firefox/Safari, so the
    // frame dies right after — no second print from a stale document.
    iframe.remove();
  }
}

/** Browsers whose print pipeline is shaky on @page sizing (PLAN.md risks):
 *  they still print, but get the "best results in Chrome/Edge" notice. */
export type PrintQualityBrowser = 'firefox' | 'safari';

export function printQualityBrowser(): PrintQualityBrowser | null {
  const ua = navigator.userAgent;
  if (/firefox/i.test(ua)) return 'firefox';
  // Chrome, Chromium, Edge, and Opera all claim to be Safari — exclude them.
  if (/safari/i.test(ua) && !/chrome|chromium|edg|opera/i.test(ua)) {
    return 'safari';
  }
  return null;
}

const HINT_KEY = 'perfectmarkd:print-hint-shown';

/** The one-time "choose Save as PDF" hint: once per tab session. */
export function hasShownPrintHint(): boolean {
  try {
    return sessionStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
}

export function markPrintHintShown(): void {
  try {
    sessionStorage.setItem(HINT_KEY, '1');
  } catch {
    // Storage unavailable (privacy mode, hardened browsers): the hint simply
    // reshows next time instead of breaking the export.
  }
}
