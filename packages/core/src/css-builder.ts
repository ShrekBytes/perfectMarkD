// ─────────────────────────────────────────────────────────────────────────────
// CSS generation + page geometry.
//
// Turns a DocumentSettings object into the CSS strings the preview (shadow
// DOM) and export (print HTML) paths both consume, plus the small string
// utilities, HTML fragments, and the page-box geometry (resolvePageGeometry)
// those paths share. Everything here is pure computation — no DOM, no
// platform imports. Code-block colors live at the markdown-render layer
// (Shiki emits its own token colors inline); math is KaTeX, which ships
// static CSS, so no stylesheet extraction happens here.
// ─────────────────────────────────────────────────────────────────────────────

import { PAGE_SIZES, type DocumentSettings } from './settings.js';

// ─── Small utilities ──────────────────────────────────────────────────────────

/** mm → px at 96 dpi, matching the browser print pipeline. */
export const mmToPx = (mm: number) => (mm / 25.4) * 96;

/**
 * Returns the page dimensions in px for the current settings.
 * For "Custom", converts the user-entered mm values; for named sizes, looks up
 * PAGE_SIZES directly. Orientation swapping is handled by callers.
 */
export function resolvePageDims(s: DocumentSettings): { w: number; h: number } {
  if (s.pageSize === 'Custom') {
    return {
      w: Math.max(1, Math.round(mmToPx(s.customPageWidth))),
      h: Math.max(1, Math.round(mmToPx(s.customPageHeight))),
    };
  }
  return PAGE_SIZES[s.pageSize] ?? PAGE_SIZES['A4']!;
}

/** The full page box geometry shared by pagination, the preview, and the
 *  export HTML: page size (orientation applied), margins in px, header/footer
 *  band heights, and the resulting content box. Every consumer must derive
 *  these from this one function — pagination measures against contentH, and
 *  the export positions layers with the same numbers, so divergent derivations
 *  would shift content between preview and print. */
export interface PageGeometry {
  /** Page width/height in px, orientation already applied. */
  pw: number;
  ph: number;
  /** Page margins in px. */
  mTop: number;
  mBottom: number;
  mLeft: number;
  mRight: number;
  /** Header/footer band heights in px; 0 when the band is off. */
  headerH: number;
  footerH: number;
  /** Content box: page minus margins minus both bands, clamped ≥ 1px so the
   *  paginator sandbox never measures at zero size. */
  contentW: number;
  contentH: number;
}

/** Resolves the page box geometry for the current settings.
 *  Band heights follow the same rules as the plugin's render pass: an
 *  explicit setting wins; otherwise the band auto-sizes from its font size
 *  and only exists when it has something to show (text, page number, border,
 *  or banner image). */
export function resolvePageGeometry(s: DocumentSettings): PageGeometry {
  const dims = resolvePageDims(s);
  const pw = s.orientation === 'landscape' ? dims.h : dims.w;
  const ph = s.orientation === 'landscape' ? dims.w : dims.h;

  const mTop = mmToPx(s.marginTop);
  const mBottom = mmToPx(s.marginBottom);
  const mLeft = mmToPx(s.marginLeft);
  const mRight = mmToPx(s.marginRight);

  const footerH =
    s.showFooter &&
    (s.showPageNumbers ||
      !!s.footerText ||
      s.showFooterBorder ||
      !!s.footerImageRef)
      ? s.footerHeight > 0
        ? s.footerHeight
        : Math.max(28, s.footerFontSize + 14)
      : 0;
  const headerH =
    s.showHeader && (!!s.headerText || s.showHeaderBorder || !!s.headerImageRef)
      ? s.headerHeight > 0
        ? s.headerHeight
        : Math.max(20, s.headerFontSize + 10)
      : 0;

  return {
    pw,
    ph,
    mTop,
    mBottom,
    mLeft,
    mRight,
    headerH,
    footerH,
    contentW: Math.max(1, pw - mLeft - mRight),
    contentH: Math.max(1, ph - mTop - mBottom - footerH - headerH),
  };
}

export function escapeHTML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escapes `</style` in CSS text to prevent the HTML parser from ending the
// <style> block early, regardless of where the sequence appears.
export function escapeCSSForStyle(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style');
}

/** Maps a `backgroundImageSize` setting value to its CSS `background-size`
 *  and `background-repeat` values. Centralises logic shared by the preview
 *  and export render paths. */
export function bgImageCssProps(
  size: DocumentSettings['backgroundImageSize'],
): {
  size: string;
  repeat: string;
} {
  return {
    size: size === 'fill' ? '100% 100%' : size === 'tile' ? 'auto' : size, // "cover" | "contain" pass through
    repeat: size === 'tile' ? 'repeat' : 'no-repeat',
  };
}

// ─── Color & font helpers ─────────────────────────────────────────────────────

/** Returns relative luminance (0–1) of a CSS hex color; non-hex values return 1 (treat as light). */
export function hexLuminance(hex: string): number {
  const full = hex.replace(
    /^#([\da-f])([\da-f])([\da-f])$/i,
    (_, r, g, b) => `#${r}${r}${g}${g}${b}${b}`,
  );
  if (!/^#[\da-f]{6}$/i.test(full)) return 1;
  const linearize = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const r = linearize(parseInt(full.slice(1, 3), 16) / 255);
  const g = linearize(parseInt(full.slice(3, 5), 16) / 255);
  const b = linearize(parseInt(full.slice(5, 7), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Returns the resolved CSS font-family string for the current settings. */
export function resolveFont(s: DocumentSettings): string {
  return s.fontFamily === '__custom__'
    ? s.customFontName.trim() || 'inherit'
    : s.fontFamily;
}

/** Returns the resolved CSS font-family string for code blocks (inline and fenced). */
export function resolveCodeFont(s: DocumentSettings): string {
  return s.codeFontFamily === '__custom__'
    ? s.customCodeFontName.trim() || "'Courier New', monospace"
    : s.codeFontFamily;
}

// ─── Code block base styling ──────────────────────────────────────────────────
// Shiki colors highlighted code inline at markdown-render time, so this only
// carries the settings-driven base: background, font, ligatures. Plain code
// (codeTheme "none", un-highlighted fences) renders on the code background in
// the body color, and Shiki's inline colors override these rules when present.

/** Builds the `<pre>`/`<pre><code>` base rules shared by the preview shadow
 *  DOM and the export print HTML. */
export function buildCodeBlockCSS(s: DocumentSettings): string {
  const codeFontFamily = resolveCodeFont(s);
  const ligatures = s.codeFontLigatures ? 'normal' : 'none';

  return `
  .mpdf-doc pre {
    background: ${s.codeBackground};
    border-radius: 4px;
    padding: 10px 12px;
    margin: 0 0 ${s.paragraphSpacing}em;
    overflow: hidden;
  }
  .mpdf-doc pre code {
    font-family: ${codeFontFamily};
    font-variant-ligatures: ${ligatures};
    font-size: ${s.codeFontSize}em;
    color: ${s.bodyColor};
    white-space: pre-wrap;
    overflow-wrap: break-word;
    background: none;
    padding: 0;
  }`;
}

// ─── Page frame helpers ───────────────────────────────────────────────────────
// Shared by the preview DOM path (apps build the frame element themselves) and
// the export HTML builder.

/** Shorthand `border` value for the page frame, shared by the preview and export paths. */
export function frameBorderCSS(s: DocumentSettings): string {
  return `${s.frameThickness}px ${s.frameStyle} ${s.frameColor}`;
}

/** Returns the page-edge frame markup for the export HTML — absolutely
 *  positioned inside the page box and inset by frameMargin on all sides so it
 *  sits outside the margin-bound header, footer, and content: the outermost
 *  decoration on the page. Empty string when the frame is disabled. */
export function buildFrameOverlayHTML(s: DocumentSettings): string {
  if (!s.frameEnabled) return '';
  const inset = `${s.frameMargin}px`;
  return `<div style="position:absolute;top:${inset};left:${inset};right:${inset};bottom:${inset};pointer-events:none;box-sizing:border-box;border:${frameBorderCSS(s)};"></div>`;
}

// ─── Doc CSS builder ──────────────────────────────────────────────────────────

/** Builds the full `.mpdf-doc` stylesheet (typography, tables, GFM alerts,
 *  mermaid, code blocks) shared verbatim by the preview shadow DOM and the
 *  export print HTML. */
export function buildDocCSS(s: DocumentSettings, isRTL = false): string {
  const hs = s.headingScale;
  const fontFamily = resolveFont(s);
  const tableHeaderTextColor =
    hexLuminance(s.tableHeaderBg) < 0.35 ? '#fff' : s.headingColor;

  return `
  .mpdf-doc {
    font-family: ${fontFamily};
    font-size: ${s.fontSize}px;
    line-height: ${s.lineHeight};
    color: ${s.bodyColor};
    box-sizing: border-box;
    ${isRTL ? 'direction: rtl;' : ''}
  }
  .mpdf-doc *, .mpdf-doc *::before, .mpdf-doc *::after { box-sizing: border-box; }
  .mpdf-doc strong, .mpdf-doc b { font-weight: 700; font-style: normal; color: ${s.boldColor}; }
  .mpdf-doc h1 strong, .mpdf-doc h1 b,
  .mpdf-doc h2 strong, .mpdf-doc h2 b,
  .mpdf-doc h3 strong, .mpdf-doc h3 b,
  .mpdf-doc h4 strong, .mpdf-doc h4 b,
  .mpdf-doc h5 strong, .mpdf-doc h5 b,
  .mpdf-doc h6 strong, .mpdf-doc h6 b { color: inherit; }
  .mpdf-doc em, .mpdf-doc i { font-style: italic; font-weight: inherit; }
  .mpdf-doc mark { background: #ffe066; color: inherit; padding: 0 2px; border-radius: 2px; }
  .mpdf-doc del, .mpdf-doc s { text-decoration: line-through; }
  .mpdf-doc h1 {
    font-size: ${Math.round(22 * hs)}px;
    font-weight: 700;
    color: ${s.headingColor};
    margin: 0 0 ${Math.round(12 * hs)}px;
    line-height: 1.2;
    ${s.h1BorderBottom ? `border-bottom: 2px solid ${s.accentColor}; padding-bottom: 6px;` : ''}
    ${s.centerH1 ? 'text-align: center;' : ''}
  }
  .mpdf-doc h2 {
    font-size: ${Math.round(17 * hs)}px;
    font-weight: 600;
    color: ${s.headingColor};
    margin: ${Math.round(20 * hs)}px 0 ${Math.round(10 * hs)}px;
    ${s.h2BorderBottom ? `border-bottom: 0.5px solid ${s.accentColor}55; padding-bottom: 5px;` : ''}
  }
  .mpdf-doc h3 {
    font-size: ${Math.round(15 * hs)}px;
    font-weight: 700;
    color: ${s.headingColor};
    margin: ${Math.round(16 * hs)}px 0 ${Math.round(8 * hs)}px;
    letter-spacing: 0.01em;
  }
  .mpdf-doc h4 { font-size: ${Math.round(13 * hs)}px; font-weight: 700; color: ${s.headingColor}; margin: 12px 0 6px; text-transform: uppercase; letter-spacing: 0.04em; }
  .mpdf-doc h5 { font-size: ${Math.round(12 * hs)}px; font-weight: 600; color: ${s.headingColor}; margin: 10px 0 4px; font-style: italic; }
  .mpdf-doc h6 { font-size: ${Math.round(11 * hs)}px; font-weight: 600; color: ${s.bodyColor}; margin: 8px 0 4px; font-style: italic; opacity: 0.75; }
  .mpdf-doc p { margin: 0 0 ${s.paragraphSpacing}em; }
  .mpdf-doc ul, .mpdf-doc ol { padding-inline-start: 1.4em; margin: 0 0 ${s.paragraphSpacing}em; }
  .mpdf-doc li { margin-bottom: 0.2em; line-height: ${s.lineHeight}; }
  .mpdf-doc blockquote {
    border-inline-start: 3px solid ${s.blockquoteBorderColor};
    background: ${s.blockquoteBg};
    padding-block: 4px;
    padding-inline: 1em 0;
    margin: ${s.paragraphSpacing}em 0;
    font-style: italic;
    color: ${s.bodyColor}cc;
  }
  .mpdf-doc code {
    font-family: ${resolveCodeFont(s)};
    font-variant-ligatures: ${s.codeFontLigatures ? 'normal' : 'none'};
    font-size: ${s.codeFontSize}em;
    background: ${s.codeBackground};
    padding: 1px 4px;
    border-radius: 3px;
    color: ${s.accentColor};
  }
  ${buildCodeBlockCSS(s)}
  .mpdf-doc hr {
    border: none;
    border-top: 0.5px solid ${s.accentColor}44;
    margin: ${s.paragraphSpacing * 1.5}em 0;
  }
  .mpdf-doc img { max-width: 100%; height: auto; display: block; margin: ${s.paragraphSpacing}em auto; }
  .mpdf-doc a { color: ${s.accentColor}; ${s.linkUnderline ? '' : 'text-decoration: none;'} }
  .mpdf-doc table { width: 100%; border-collapse: collapse; margin: 0 0 ${s.paragraphSpacing}em; font-size: 0.92em; }
  .mpdf-doc th {
    background: ${s.tableHeaderBg};
    color: ${tableHeaderTextColor};
    padding: 6px 10px;
    text-align: start;
    font-weight: 600;
    border: 0.5px solid ${s.accentColor}33;
    font-size: 0.9em;
  }
  .mpdf-doc td { padding: 5px 10px; border: 0.5px solid ${s.bodyColor}22; vertical-align: top; }
  ${s.tableStriped ? `.mpdf-doc tbody tr:nth-child(even) { background: ${s.tableHeaderBg}55; }` : ''}

  /* GFM Alerts (GitHub-style > [!NOTE] blocks). One accent-styled design for
   * all five variants; the title band spans the full alert width via negative
   * margins against the container's content gutter. */
  .mpdf-doc .markdown-alert {
    border-inline-start: 4px solid ${s.accentColor};
    border-start-start-radius: 0;
    border-start-end-radius: 5px;
    border-end-end-radius: 5px;
    border-end-start-radius: 0;
    background: ${s.accentColor}12;
    margin: ${s.paragraphSpacing * 1.2}em 0;
    padding: 0 14px 9px;
    overflow: hidden;
    box-shadow: inset 0 0 0 1px ${s.accentColor}22;
    font-style: normal;
  }
  .mpdf-doc .markdown-alert-title {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0 -14px;
    padding: 7px 12px;
    background: ${s.accentColor}28;
    border-bottom: 1px solid ${s.accentColor}33;
    font-family: ${fontFamily};
    font-size: 0.8em;
    font-weight: 800;
    font-style: normal;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${s.accentColor};
    line-height: 1.3;
  }
  .mpdf-doc .markdown-alert-title svg {
    flex-shrink: 0;
    width: 15px;
    height: 15px;
    stroke: ${s.accentColor};
    fill: none;
    stroke-width: 2;
  }
  .mpdf-doc .markdown-alert-title + * {
    margin-top: 9px;
  }
  .mpdf-doc .markdown-alert > :last-child:not(.markdown-alert-title) {
    margin-bottom: 0;
  }
  /* Nested blockquotes inside alerts keep a subtler indent */
  .mpdf-doc .markdown-alert blockquote {
    border-inline-start-color: ${s.accentColor}66;
    background: transparent;
  }

  /* Mermaid diagrams — centre the SVG and prevent it overflowing the content
   * column.  The <style> block inside the SVG is intentionally left untouched;
   * mermaid embeds its own theme CSS there. */
  .mpdf-doc .mermaid {
    display: flex;
    justify-content: center;
    margin: ${s.paragraphSpacing}em 0;
    overflow: hidden;
  }
  .mpdf-doc .mermaid svg {
    max-width: 100%;
    height: auto;
    display: block;
  }
  `.trim();
}
