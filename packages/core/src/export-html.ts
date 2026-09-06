// ─────────────────────────────────────────────────────────────────────────────
// Export HTML builder — the shared print document.
//
// Ported from the plugin's export-modal.ts `buildExportDocument`: assembles
// the full standalone print-ready HTML document from paginated page layouts.
// Layer order inside each page box is background image → header banner →
// header text → content → footer banner → footer text → frame (banners precede
// their text divs so DOM order paints text on top), one `page-break-after`
// div per page, `@page` sized from the settings, and the shared doc CSS
// inlined into <head>.
//
// This one string feeds both export paths (ADR-0003's single-pipeline
// guarantee): Client Export writes it into a hidden iframe and calls print();
// Server Export loads it in headless Chromium via the app's /export route and
// calls Page.pdf(). Both contexts are Chromium, so no cross-engine CSS forks
// belong here.
//
// Pure string assembly — no DOM access; page nodes are serialized via their
// own outerHTML. Asset refs (banner/background images) resolve through the
// host-supplied AssetResolver; an unresolvable ref drops that layer.
// ─────────────────────────────────────────────────────────────────────────────

import {
  bannerStyle,
  bgImageLayerStyle,
  buildDocCSS,
  buildFrameOverlayHTML,
  buildHFInnerHTML,
  escapeCSSForStyle,
  escapeHTML,
  footerBandStyle,
  headerBandStyle,
  resolvePageGeometry,
} from './css-builder.js';
import { isRTLContent } from './render.js';
import type { PageLayout } from './paginator.js';
import type { AssetResolver } from './assets.js';
import type { DocumentSettings } from './settings.js';

/** Optional inputs for buildExportHTML. Everything required to assemble the
 *  print document arrives through the positional arguments; these only tune
 *  metadata, host-supplied stylesheets, and RTL parity with the preview. */
export interface ExportHTMLOptions {
  /** Document title for the <title> element. Defaults to "Export" — the
   *  plugin used the document's basename. Only metadata: visible page content
   *  comes from the layouts. */
  title?: string;
  /** Math stylesheet text (KaTeX) inlined as its own <style> before the print
   *  CSS — the slot the plugin filled with inlined MathJax CSS. Math in the
   *  page nodes is unstyled without it, so hosts pass their bundled
   *  `@perfectmarkd/core/katex.css` text (the same stylesheet the preview
   *  uses, keeping preview and print identical). Font URLs inside it are the
   *  host's to make resolvable from the export document. */
  mathCSS?: string;
  /** RTL switch for the doc CSS and the content div's dir attribute. When
   *  omitted it is derived from the layout content (same heuristic the render
   *  pipeline applies to raw markdown). Pass the value used for buildDocCSS
   *  during pagination so the print CSS matches what was measured. */
  isRTL?: boolean;
}

/** Builds the full standalone print HTML document for the given layouts.
 *  Throws when there is nothing to export — callers (the export UIs) decide
 *  how to surface that. */
export function buildExportHTML(
  layouts: PageLayout[],
  s: DocumentSettings,
  assets: AssetResolver,
  options: ExportHTMLOptions = {},
): string {
  if (layouts.length === 0) {
    throw new Error('buildExportHTML: layouts is empty — nothing to export.');
  }

  const g = resolvePageGeometry(s);
  const isRTL =
    options.isRTL ??
    isRTLContent(
      layouts
        .flatMap((l) => l.pageNodes.map((n) => n.textContent ?? ''))
        .join(' '),
    );
  const docCSS = buildDocCSS(s, isRTL);
  const frameHTML = buildFrameOverlayHTML(s);

  // Resolve asset refs once: the same banner/background layers repeat on
  // every page that shows them. Guards mirror the plugin: a disabled band or
  // background never resolves its ref, and an unresolvable ref drops the layer.
  const headerBannerUrl =
    s.showHeader && s.headerImageRef ? assets(s.headerImageRef) : undefined;
  const footerBannerUrl =
    s.showFooter && s.footerImageRef ? assets(s.footerImageRef) : undefined;
  const bgUrl =
    s.backgroundImageEnabled && s.backgroundImageRef
      ? assets(s.backgroundImageRef)
      : undefined;

  // Page background image (identical on every page; rendered first so it's
  // behind everything). "full-page" covers header+content+footer; "content-only"
  // fills just the content box.
  const bgStyle = bgImageLayerStyle(s, g, bgUrl);
  const bgImgHTML = bgStyle ? `<div style="${bgStyle}"></div>` : '';

  const pageHTMLParts = layouts.map((layout) => {
    // pageNodes have already been through postProcessRenderedHTML, which
    // strips style/script tags (preserving those inside SVGs for mermaid).
    // No further sanitisation needed — serialize directly.
    const contentHTML = layout.pageNodes.map((n) => n.outerHTML).join('\n');

    const headerHTML = layout.hasHeader
      ? `<div style="${headerBandStyle(s, g)}">${buildHFInnerHTML(layout.headerCenter, layout.headerLeft, layout.headerRight)}</div>`
      : '';

    const contentDivHTML = `<div class="mpdf-doc"${isRTL ? ' dir="rtl"' : ''} style="position:absolute;top:${g.mTop + g.headerH}px;left:${g.mLeft}px;width:${g.contentW}px;">${contentHTML}</div>`;

    const footerHTML = layout.hasFooter
      ? `<div style="${footerBandStyle(s, g)}">${buildHFInnerHTML(layout.footerCenter, layout.footerLeft, layout.footerRight)}</div>`
      : '';

    // Banner divs precede their text divs so DOM order puts text on top.
    const headerBannerHTML =
      layout.pageShowsHeader && headerBannerUrl
        ? `<div style="${bannerStyle(s, g, headerBannerUrl, 'header')}"></div>`
        : '';
    const footerBannerHTML =
      layout.pageShowsFooter && footerBannerUrl
        ? `<div style="${bannerStyle(s, g, footerBannerUrl, 'footer')}"></div>`
        : '';

    return `<div class="mpdf-export-page">${bgImgHTML}${headerBannerHTML}${headerHTML}${contentDivHTML}${footerBannerHTML}${footerHTML}${frameHTML}</div>`;
  });

  const printCSS = `
      /* Exact colors are the print pipeline's whole point (banners, backgrounds,
         syntax themes): without this browsers strip them to save ink. */
      *, *::before, *::after {
        box-sizing: border-box;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      @page { size: ${g.pw}px ${g.ph}px; margin: 0; }
      html, body { margin: 0; padding: 0; background: ${s.pageBackground}; }
      .mpdf-export-page {
        position: relative;
        width: ${g.pw}px; height: ${g.ph}px;
        overflow: hidden;
        background: ${s.pageBackground};
        page-break-after: always; break-after: page;
      }
      .mpdf-export-page:last-child { page-break-after: avoid; break-after: avoid; }
      ${docCSS}
    `;

  const title = options.title ?? 'Export';
  const mathCSS = options.mathCSS
    ? `<style>${escapeCSSForStyle(options.mathCSS)}</style>\n`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${escapeHTML(title)}</title>
${mathCSS}<style>${escapeCSSForStyle(printCSS)}</style>
</head>
<body>
${pageHTMLParts.join('\n')}
</body>
</html>`;
}
