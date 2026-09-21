// ─────────────────────────────────────────────────────────────────────────────
// The /export page's side of the Server Export wire contract (server/03,
// ADR-0003). The worker loads this route in headless Chromium, posts a
// payload, and the page paints the exact export document the Client Export
// builds — one pipeline, three consumers (preview, print, Page.pdf).
//
// The handshake (controller side: apps/server/src/export/render.ts):
//   1. the page sets `window.__pmdExportReady = true` once its listener is on;
//   2. the controller posts { type: 'pmd:export-render', payload } to this
//      window;
//   3. the page paints the export document into the top-level document,
//      waits for its webfonts, and calls `window.__pmdExportDone(result)` —
//      installed by the controller with Playwright's exposeFunction.
//
// This module deliberately avoids Vite-specific imports (the ?inline KaTeX
// import lives in ExportPage, which passes the stylesheet in as an option)
// so the end-to-end render test can bundle it with esbuild — the same trick
// the engine's golden suite uses.
// ─────────────────────────────────────────────────────────────────────────────

import {
  buildExportHTML,
  buildFontFaceCSS,
  extractOutlineEntries,
  type DocumentSettings,
  type OutlineEntry,
  type RenderMermaidHook,
} from '@perfectmarkd/core';
import { registerPayloadFonts } from '../fonts/loader';
import { runDocumentPipeline } from '../canvas/pipeline';

export const EXPORT_RENDER_MESSAGE = 'pmd:export-render';
export const EXPORT_READY_FLAG = '__pmdExportReady';
export const EXPORT_DONE_FUNCTION = '__pmdExportDone';

/** Field-for-field what POST /api/export validated
 *  (apps/server/src/export/payload.ts) — the two only share names, and the
 *  end-to-end render test drives both ends together. */
export interface ExportRenderPayload {
  title: string;
  markdown: string;
  settings: DocumentSettings;
  /** asset:// refs resolved to data: URIs by the client. */
  assets: Record<string, string>;
  /** The document's custom fonts (billing/05): family → data: URI. */
  fonts: Record<string, string>;
}

export interface ExportRenderSuccess {
  ok: true;
  pageCount: number;
  outline: OutlineEntry[];
}

export interface ExportRenderFailure {
  ok: false;
  errorCode: string;
  message: string;
}

export type ExportRenderResult = ExportRenderSuccess | ExportRenderFailure;

export interface ExportRenderMessage {
  type: typeof EXPORT_RENDER_MESSAGE;
  payload: ExportRenderPayload;
}

export function isExportRenderMessage(
  data: unknown,
): data is ExportRenderMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as ExportRenderMessage).type === EXPORT_RENDER_MESSAGE &&
    typeof (data as ExportRenderMessage).payload === 'object' &&
    (data as ExportRenderMessage).payload !== null
  );
}

export interface RenderServerExportOptions {
  /** The KaTeX stylesheet text — the real app passes the processed
   *  KATEX_EXPORT_CSS so math prints with the preview's fonts. */
  mathCSS: string;
  /** Mermaid fence renderer; omitted (or failing) leaves diagrams as code
   *  blocks — the same contract the Client Export uses. */
  renderMermaid?: RenderMermaidHook;
}

/**
 * Runs the engine pipeline over the payload — the exact Client Export
 * builder, minus IndexedDB (assets arrive as data: URIs) — paints the
 * standalone export document into THIS window, and reports the outline +
 * page count for the controller's Page.pdf() call.
 */
export async function renderServerExportDocument(
  payload: ExportRenderPayload,
  options: RenderServerExportOptions,
): Promise<ExportRenderResult> {
  try {
    const title = payload.title.trim() || 'Untitled';
    const resolveAsset = (ref: string) => payload.assets[ref];

    // Custom fonts (billing/05) live before pagination: the layout must
    // measure the real metrics, or the rendered page count could disagree
    // with the client's declared pageCount. A corrupt font falls back —
    // and only the faces that registered get embedded in the print
    // document, which would never load the corrupt ones either.
    const registeredFonts = await registerPayloadFonts(payload.fonts);

    const result = await runDocumentPipeline(
      payload.markdown,
      payload.settings,
      {
        title,
        renderMermaid: options.renderMermaid,
      },
    );

    // Markdown images keep their asset:// refs through the render; swap in
    // the payload's data: URIs (dropping unresolvable ones) exactly like the
    // Client Export path — the output must be self-contained.
    for (const layout of result.layouts) {
      for (const node of layout.pageNodes) {
        for (const img of node.querySelectorAll('img[src^="asset://"]')) {
          const resolved = resolveAsset(img.getAttribute('src')!);
          if (resolved) img.setAttribute('src', resolved);
          else img.remove();
        }
      }
    }

    const html = buildExportHTML(
      result.layouts,
      payload.settings,
      resolveAsset,
      {
        title,
        mathCSS: options.mathCSS,
        isRTL: result.isRTL,
        // The same URIs the faces registered from, embedded so the print
        // document carries its own fonts.
        fontFaceCSS: buildFontFaceCSS(
          Object.entries(payload.fonts)
            .filter(([family]) => registeredFonts.includes(family))
            .map(([family, url]) => ({ family, url })),
        ),
      },
    );
    paintExportDocument(html);
    await awaitFontsReady();

    return {
      ok: true,
      pageCount: result.layouts.length,
      outline: extractOutlineEntries(result.layouts),
    };
  } catch (error) {
    return {
      ok: false,
      errorCode: 'render_failed',
      message: error instanceof Error ? error.message : 'Unknown render error.',
    };
  }
}

/**
 * Replaces this document's contents with the standalone export document:
 * Page.pdf() prints the main frame, so the export markup must BE the
 * document, not a subtree under the app's styles. adopt-orphaned nodes keep
 * the running script realm alive — `window.__pmdExportDone` still works
 * after the swap, which is the whole point of painting instead of navigating.
 */
function paintExportDocument(html: string): void {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  document.documentElement.replaceChildren(
    ...Array.from(doc.head.childNodes),
    doc.body,
  );
  for (const name of Array.from(doc.documentElement.getAttributeNames())) {
    document.documentElement.setAttribute(
      name,
      doc.documentElement.getAttribute(name)!,
    );
  }
}

/** Webfonts (KaTeX) must finish before Page.pdf, or math prints with
 *  fallback metrics. Settles immediately when nothing is loading or the
 *  Font Loading API is unavailable (jsdom, hardened browsers). */
async function awaitFontsReady(): Promise<void> {
  try {
    await document.fonts?.ready;
  } catch {
    // A broken font API must not fail the export — Chromium's own print path
    // re-checks fonts internally anyway.
  }
}
