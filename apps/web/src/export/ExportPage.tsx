import { useEffect } from 'react';
import { KATEX_EXPORT_CSS } from '../canvas/katex-css';
import { renderMermaid } from '../canvas/mermaid';
import {
  EXPORT_DONE_FUNCTION,
  EXPORT_READY_FLAG,
  isExportRenderMessage,
  renderServerExportDocument,
  type ExportRenderResult,
} from './protocol';

declare global {
  interface Window {
    /** Set once the /export page is listening for the payload — the
     *  controller (render.ts) waits for it before posting. Value must match
     *  EXPORT_READY_FLAG. */
    __pmdExportReady?: boolean;
    /** Installed by the controller (Playwright exposeFunction). Value must
     *  match EXPORT_DONE_FUNCTION. */
    __pmdExportDone?: (result: ExportRenderResult) => void;
  }
}

/**
 * The hidden /export route (server/03, ADR-0003): no chrome, noindex, and
 * exactly one job — receive the document payload via postMessage, run the
 * same engine pipeline the preview and Client Export run, paint the export
 * document, and report back. Humans who land here see a blank page; the
 * server's headless Chromium is the only intended visitor.
 */
export function ExportPage() {
  useEffect(() => {
    // The route must never be indexed; a runtime meta tag is what a SPA can
    // do (crawlers that execute JS see it, and the page has no links to
    // follow regardless).
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);

    let disposed = false;
    const onMessage = (event: MessageEvent) => {
      // Only this window's controller may drive a render, and only on the
      // agreed message type.
      if (
        event.source !== window ||
        event.origin !== window.location.origin ||
        !isExportRenderMessage(event.data)
      ) {
        return;
      }
      void renderServerExportDocument(event.data.payload, {
        mathCSS: KATEX_EXPORT_CSS,
        renderMermaid,
      }).then((result) => {
        // The paint step replaces the document; this callback and the flag
        // live on `window`, which survives it.
        if (!disposed) window[EXPORT_DONE_FUNCTION]?.(result);
      });
    };
    window.addEventListener('message', onMessage);
    window[EXPORT_READY_FLAG] = true;

    return () => {
      disposed = true;
      window.removeEventListener('message', onMessage);
      window[EXPORT_READY_FLAG] = false;
      meta.remove();
    };
  }, []);

  return <div aria-hidden="true" />;
}
