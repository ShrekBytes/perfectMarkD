// ─────────────────────────────────────────────────────────────────────────────
// One page of the Paper Canvas: a shadow-DOM host carrying the laid-out page
// exactly as the export HTML draws it.
//
// The plugin's drawPreview approach: each page is its own shadow root (the
// scoped docCSS can't leak into the app chrome, and app styles can't distort
// the page), the shared doc CSS + KaTeX layout rules are adopted as
// stylesheets, and the page box layers background image → header banner →
// header text → content → footer banner → footer text → frame — identical
// order, geometry, and inline styles to buildExportHTML's page boxes, so the
// preview is pixel-consistent with both export paths by construction.
//
// Page nodes are appended into the content root (consumed, not cloned): a
// layout renders once. The host stays unscaled at true page pixels; the
// canvas applies zoom on a wrapper. Banner/background image refs resolve
// through the host-supplied AssetResolver; an unresolvable ref drops that
// layer, matching export behavior.
// ─────────────────────────────────────────────────────────────────────────────

import {
  bannerStyle,
  bgImageLayerStyle,
  buildFrameOverlayHTML,
  buildHFInnerHTML,
  footerBandStyle,
  headerBandStyle,
  type AssetResolver,
  type DocumentSettings,
  type PageGeometry,
  type PageLayout,
} from '@perfectmarkd/core';

/**
 * The shadow-root stylesheets for a render pass: the math layout rules first,
 * then the doc CSS, mirroring the export document's <style> order. Build once
 * per render and share across every page — one CSSStyleSheet per document,
 * not per page.
 */
export function createPageSheets(
  docCSS: string,
  mathCSS: string,
): CSSStyleSheet[] {
  const math = new CSSStyleSheet();
  math.replaceSync(mathCSS);
  const doc = new CSSStyleSheet();
  doc.replaceSync(docCSS);
  return [math, doc];
}

export interface PageBuildInput {
  layout: PageLayout;
  settings: DocumentSettings;
  geometry: PageGeometry;
  sheets: CSSStyleSheet[];
  assets: AssetResolver;
  /** The pipeline's RTL decision — must match what pagination measured. */
  isRTL: boolean;
}

export interface BuiltPage {
  /** The shadow host to append into the pages area (true page pixels; the
   *  caller applies zoom scaling on a wrapper). */
  host: HTMLDivElement;
  /** The content root inside the shadow tree — where heading IDs and anchor
   *  links live for the canvas's jump-to-page handling. */
  contentRoot: HTMLDivElement;
}

/** Appends `html` as a single child layer div with the given data-pm-layer tag. */
function appendLayer(box: HTMLElement, name: string, style: string): void {
  const el = document.createElement('div');
  el.dataset.pmLayer = name;
  el.style.cssText = style;
  box.appendChild(el);
}

/**
 * Builds one shadow-DOM page for the given layout.
 */
export function buildPage({
  layout,
  settings: s,
  geometry: g,
  sheets,
  assets,
  isRTL,
}: PageBuildInput): BuiltPage {
  const host = document.createElement('div');
  host.className = 'pm-page-host';
  // The canvas scales this host for zoom; top-left origin keeps the scaled
  // page aligned with its wrapper box.
  host.style.cssText = `width:${g.pw}px;height:${g.ph}px;transform-origin:0 0;`;

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.adoptedStyleSheets = sheets;

  const box = document.createElement('div');
  box.className = 'pm-page-box';
  box.style.cssText = `position:relative;width:${g.pw}px;height:${g.ph}px;overflow:hidden;background:${s.pageBackground};`;
  shadow.appendChild(box);

  // Page background image (identical on every page; painted first so it's
  // behind everything). "full-page" covers header+content+footer;
  // "content-only" fills just the content box.
  const bgUrl =
    s.backgroundImageEnabled && s.backgroundImageRef
      ? assets(s.backgroundImageRef)
      : undefined;
  const bgStyle = bgImageLayerStyle(s, g, bgUrl);
  if (bgStyle) appendLayer(box, 'background', bgStyle);

  // Banner divs precede their text divs so DOM order paints text on top.
  const headerBannerUrl =
    s.showHeader && s.headerImageRef ? assets(s.headerImageRef) : undefined;
  if (layout.pageShowsHeader && headerBannerUrl) {
    appendLayer(
      box,
      'header-banner',
      bannerStyle(s, g, headerBannerUrl, 'header'),
    );
  }

  if (layout.hasHeader) {
    appendLayer(box, 'header-text', headerBandStyle(s, g));
    box.lastElementChild!.innerHTML = buildHFInnerHTML(
      layout.headerCenter,
      layout.headerLeft,
      layout.headerRight,
    );
  }

  const contentRoot = document.createElement('div');
  contentRoot.className = 'mpdf-doc';
  contentRoot.dataset.pmLayer = 'content';
  if (isRTL) contentRoot.setAttribute('dir', 'rtl');
  contentRoot.style.cssText = `position:absolute;top:${g.mTop + g.headerH}px;left:${g.mLeft}px;width:${g.contentW}px;`;
  for (const node of layout.pageNodes) contentRoot.appendChild(node);
  box.appendChild(contentRoot);

  const footerBannerUrl =
    s.showFooter && s.footerImageRef ? assets(s.footerImageRef) : undefined;
  if (layout.pageShowsFooter && footerBannerUrl) {
    appendLayer(
      box,
      'footer-banner',
      bannerStyle(s, g, footerBannerUrl, 'footer'),
    );
  }

  if (layout.hasFooter) {
    appendLayer(box, 'footer-text', footerBandStyle(s, g));
    box.lastElementChild!.innerHTML = buildHFInnerHTML(
      layout.footerCenter,
      layout.footerLeft,
      layout.footerRight,
    );
  }

  if (s.frameEnabled) {
    const template = document.createElement('template');
    template.innerHTML = buildFrameOverlayHTML(s);
    const frame = template.content.firstElementChild as HTMLElement;
    frame.dataset.pmLayer = 'frame';
    box.appendChild(frame);
  }

  return { host, contentRoot };
}
