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

/** The layout half of a KaTeX stylesheet: everything from its first `.katex`
 *  rule on, dropping the `@font-face` block that precedes it.
 *
 *  Both consumers of the math rules need the same slice, for the same reason:
 *  the faces are the host's to resolve — the web app registers them
 *  document-wide, and a shadow-level copy would resolve its `url(fonts/…)`
 *  against the app root — while the layout rules have to travel with the
 *  scoped sheets, or math is measured unstyled. See the pagination CSS in
 *  `apps/web/src/canvas/pipeline.ts`.
 *
 *  Idempotent: slicing an already-sliced sheet finds the same first rule. */
export function katexLayoutCSS(css: string): string {
  const firstRule = css.indexOf('.katex{');
  return firstRule === -1 ? css : css.slice(firstRule);
}

// ─── Custom Stylesheet sanitisation (ai-transforms/01) ───────────────────────

/** Index just past the string literal opening at `i` (backslash escapes
 *  honored); the caller guarantees `css[i]` is a quote character. */
function skipCssString(css: string, i: number): number {
  let j = i + 1;
  while (j < css.length) {
    if (css[j] === '\\') j += 2;
    else if (css[j] === css[i]) return j + 1;
    else j++;
  }
  return css.length;
}

/** Index just past the comment opening at `i` (`/*`), or the end of the text
 *  when the comment never closes. */
function skipCssComment(css: string, i: number): number {
  const end = css.indexOf('*/', i + 2);
  return end === -1 ? css.length : end + 2;
}

const AT_PAGE = /^@page(?![a-z0-9-])/i;

/**
 * Removes every `@page` at-rule from CSS text. The printed page size and
 * margins are Page-tab settings written by the export itself; a user's
 * `@page { size: A3 }` obeyed in print but ignored by the preview's page
 * boxes would silently diverge the two, so the rules are stripped before the
 * stylesheet reaches any consumer. String literals and comments are skipped
 * (an `@page` mentioned inside one survives); a malformed rule without a
 * block is cut to its terminating semicolon, and an unclosed block runs to
 * the end of the text.
 */
export function stripPageAtRules(css: string): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    const ch = css[i]!;
    if (ch === '/' && css[i + 1] === '*') {
      const stop = skipCssComment(css, i);
      out += css.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const stop = skipCssString(css, i);
      out += css.slice(i, stop);
      i = stop;
      continue;
    }
    // The slice needs only the token plus one boundary character — the
    // regex's lookahead reads exactly that far.
    if (ch === '@' && AT_PAGE.test(css.slice(i, i + '@page'.length + 1))) {
      // Consume the rule: through the matching `}` of its block (margin
      // boxes nest one level of braces), or through the next `;` when there
      // is no block.
      let depth = 0;
      let j = i + '@page'.length;
      let consumed = false;
      while (j < css.length) {
        const c = css[j]!;
        if (c === '"' || c === "'") {
          j = skipCssString(css, j);
          continue;
        }
        if (c === '/' && css[j + 1] === '*') {
          j = skipCssComment(css, j);
          continue;
        }
        if (c === '{') depth++;
        else if (c === '}') {
          depth--;
          if (depth === 0) {
            j++;
            consumed = true;
            break;
          }
        } else if (c === ';' && depth === 0) {
          j++;
          consumed = true;
          break;
        }
        j++;
      }
      i = consumed ? j : css.length;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
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

/** The custom font families a settings object puts to use (billing/05):
 *  body family first, code family second, deduplicated. Empty when neither
 *  picker sits on `__custom__` — hosts load exactly these families through
 *  the FontFace API before rendering or exporting, and embed exactly these
 *  in export payloads. */
export function customFontFamilies(s: DocumentSettings): string[] {
  const families: string[] = [];
  const body = s.customFontName.trim();
  const code = s.customCodeFontName.trim();
  if (s.fontFamily === '__custom__' && body) families.push(body);
  if (s.codeFontFamily === '__custom__' && code && code !== body) {
    families.push(code);
  }
  return families;
}

/** One custom font face a host hands over for export embedding. */
export interface FontFaceSource {
  /** The CSS font-family name the face is registered under — the name the
   *  settings' customFontName carries. */
  family: string;
  /** A font URL renderable in the export context (a data: URI — the export
   *  document must be self-contained). */
  url: string;
  /** CSS format hint ("woff2", "truetype", …); omitted when unknown. */
  format?: string;
}

/** Escapes a value for a double-quoted CSS string (family names come from
 *  user file names, which may carry quotes or backslashes). */
function cssString(value: string): string {
  return `"${value.replace(/["'\\]/g, '\\$&')}"`;
}

/** Builds the @font-face rules that embed custom fonts into an export
 *  document (billing/05): one rule per face, data: URIs included, so the
 *  standalone print document renders with the uploaded faces. Returns ''
 *  for an empty list — callers insert the text only when non-empty. */
export function buildFontFaceCSS(faces: readonly FontFaceSource[]): string {
  return faces
    .map(({ family, url, format }) => {
      const src = `url(${cssString(url)})${format ? ` format(${cssString(format)})` : ''}`;
      return `@font-face { font-family: ${cssString(family)}; src: ${src}; }`;
    })
    .join('\n');
}

// ─── Code block base styling ──────────────────────────────────────────────────
// Shiki colors highlighted code inline at markdown-render time, so this only
// carries the settings-driven base: background, font, ligatures. Plain code
// (codeTheme "none", un-highlighted fences) renders on the code background in
// the body color, and Shiki's inline colors override these rules when present.

/** Builds the `<pre>`/`<pre><code>` base rules shared by the preview shadow
 *  DOM and the export print HTML. The settings-derived values are read from
 *  the `--mpdf-*` variables the doc root defines, so a Custom Stylesheet that
 *  redefines one restyles code blocks everywhere too.
 *
 *  `pre` carries the code font as well as `code` does, and it has to: the UA
 *  stylesheet's `pre { font-family: monospace }` beats inheritance, so
 *  without this the block's own font — its strut, its line box, anything
 *  written directly inside it — came from whatever monospace the host
 *  happened to have, while the text inside it came from the document's. On a
 *  machine where the two differ the block measured differently for no reason
 *  the settings could explain. */
export function buildCodeBlockCSS(codeFontLigatures: boolean): string {
  const ligatures = codeFontLigatures ? 'normal' : 'none';
  return `
  .mpdf-doc pre {
    background: var(--mpdf-code-background);
    font-family: var(--mpdf-code-font);
    border-radius: 4px;
    padding: 10px 12px;
    margin: 0 0 var(--mpdf-paragraph-spacing);
    overflow: hidden;
  }
  .mpdf-doc pre code {
    font-family: var(--mpdf-code-font);
    font-variant-ligatures: ${ligatures};
    font-size: var(--mpdf-code-font-size);
    color: var(--mpdf-body-color);
    white-space: pre-wrap;
    overflow-wrap: break-word;
    background: none;
    padding: 0;
  }`;
}

// ─── Page frame helpers ───────────────────────────────────────────────────────
// Shared by the preview DOM path (apps build the frame element themselves) and
// the export HTML builder.

/** Returns the page-edge frame markup for the export HTML — absolutely
 *  positioned inside the page box and inset by frameMargin on all sides so it
 *  sits outside the margin-bound header, footer, and content: the outermost
 *  decoration on the page. The border itself is painted by the shared
 *  `.mpdf-page-frame` sheet rule, so a Custom Stylesheet can restyle it. Empty
 *  string when the frame is disabled. */
export function buildFrameOverlayHTML(s: DocumentSettings): string {
  if (!s.frameEnabled) return '';
  const inset = `${s.frameMargin}px`;
  return `<div class="mpdf-page-frame" style="position:absolute;top:${inset};left:${inset};right:${inset};bottom:${inset};pointer-events:none;box-sizing:border-box;"></div>`;
}

// ─── Page box layers ──────────────────────────────────────────────────────────
// Inline-style strings for the layers inside a page box, shared verbatim by
// the export HTML builder and the preview page builder: one source keeps the
// preview pixel-consistent with print by construction. Callers guard the
// enable/resolution conditions (band shown, ref resolvable) and wrap the
// string in their own element.

/** Style for the page background image layer; caller passes undefined when
 *  the background is disabled or the ref unresolvable. */
export function bgImageLayerStyle(
  s: DocumentSettings,
  g: PageGeometry,
  url: string | undefined,
): string | undefined {
  if (!url) return undefined;
  const bgCss = bgImageCssProps(s.backgroundImageSize);
  const pos =
    s.backgroundImageScope === 'content-only'
      ? `top:${g.mTop + g.headerH}px;left:${g.mLeft}px;width:${g.contentW}px;height:${g.contentH}px;`
      : 'inset:0;';
  return `position:absolute;${pos}background-image:url('${url}');background-size:${bgCss.size};background-repeat:${bgCss.repeat};background-position:center;opacity:${s.backgroundImageOpacity};pointer-events:none;`;
}

/** Style for a header/footer banner image behind the band text. */
export function bannerStyle(
  s: DocumentSettings,
  g: PageGeometry,
  url: string,
  band: 'header' | 'footer',
): string {
  const edge =
    band === 'header'
      ? `top:${g.mTop * 0.4}px;left:${s.headerImageMargin}px;right:${s.headerImageMargin}px;height:${g.headerH}px;`
      : `bottom:0;left:${s.footerImageMargin}px;right:${s.footerImageMargin}px;height:${g.footerH}px;`;
  return `position:absolute;${edge}background-image:url('${url}');background-size:cover;background-position:center;background-repeat:no-repeat;pointer-events:none;`;
}

/** Style for the header text band (the band's inner markup is
 *  buildHFInnerHTML). Color is intentionally absent: the header text band is
 *  painted by the shared `.mpdf-page-header-text` sheet rule, so a Custom
 *  Stylesheet can restyle it. */
export function headerBandStyle(): string {
  return `position:absolute;top:var(--pm-band-top);left:var(--pm-margin-left);right:var(--pm-margin-right);height:var(--pm-header-h);display:flex;align-items:center;white-space:nowrap;`;
}

/** Style for the footer text band. Color is intentionally absent: the footer
 *  text band is painted by the shared `.mpdf-page-footer-text` sheet rule, so
 *  a Custom Stylesheet can restyle it. */
export function footerBandStyle(): string {
  return `position:absolute;bottom:0;left:0;right:0;height:var(--pm-footer-h);display:flex;align-items:center;padding:0 var(--pm-margin-right) 0 var(--pm-margin-left);`;
}

/** Inner markup for a header/footer band: a centered span when center text is
 *  present, otherwise a left span plus a margin-left:auto right span. Empty
 *  when the band has no text at all. Shared verbatim by the preview DOM path
 *  and the export HTML builder so band text renders identically in both. */
export function buildHFInnerHTML(
  center: string,
  left: string,
  right: string,
): string {
  if (!center && !left && !right) return '';
  return center
    ? `<span style="flex:1;text-align:center;">${escapeHTML(center)}</span>`
    : `<span>${escapeHTML(left)}</span><span style="margin-left:auto;">${escapeHTML(right)}</span>`;
}

// ─── Doc CSS builder ──────────────────────────────────────────────────────────

/** Builds the full `.mpdf-doc` stylesheet (typography, tables, GFM alerts,
 *  mermaid, code blocks) plus the shared page-chrome rules (`.mpdf-page`:
 *  paper background, header/footer text bands, page frame), shared verbatim
 *  by the preview shadow DOM and the export print HTML. The generated rules
 *  read the `--mpdf-*` variables the two root rules define, so a Custom
 *  Stylesheet that redefines one restyles the Document or the page chrome
 *  everywhere at once — and rules appended after the generated ones (the
 *  Custom Stylesheet layer) win the cascade besides. Pass the page geometry
 *  to include the chrome section; without it only the content rules build
 *  (pagination measures content only, and never sees page chrome). `@page`
 *  at-rules are stripped (page size and margins are Page-tab settings) and
 *  `</style>` sequences neutralized before the text joins the sheet. */
export function buildDocCSS(
  s: DocumentSettings,
  isRTL = false,
  geometry?: PageGeometry,
): string {
  const hs = s.headingScale;
  const fontFamily = resolveFont(s);
  const tableHeaderTextColor =
    hexLuminance(s.tableHeaderBg) < 0.35 ? '#fff' : s.headingColor;

  const generated = `
  .mpdf-doc {
    /* The Document's current style values. The generated rules below READ
     * these variables — redefining one (here or on any scoped selector, e.g.
     * from a Custom Stylesheet) restyles the document everywhere the value is
     * used. */
    --mpdf-font: ${fontFamily};
    --mpdf-font-size: ${s.fontSize}px;
    --mpdf-line-height: ${s.lineHeight};
    --mpdf-paragraph-spacing: ${s.paragraphSpacing}em;
    --mpdf-body-color: ${s.bodyColor};
    --mpdf-heading-color: ${s.headingColor};
    --mpdf-bold-color: ${s.boldColor};
    --mpdf-accent: ${s.accentColor};
    --mpdf-code-background: ${s.codeBackground};
    --mpdf-code-font: ${resolveCodeFont(s)};
    --mpdf-code-font-size: ${s.codeFontSize}em;
    --mpdf-blockquote-background: ${s.blockquoteBg};
    --mpdf-blockquote-border: ${s.blockquoteBorderColor};
    --mpdf-table-header-background: ${s.tableHeaderBg};
    font-family: var(--mpdf-font);
    font-size: var(--mpdf-font-size);
    line-height: var(--mpdf-line-height);
    color: var(--mpdf-body-color);
    box-sizing: border-box;
    ${isRTL ? 'direction: rtl;' : ''}
  }
  .mpdf-doc *, .mpdf-doc *::before, .mpdf-doc *::after { box-sizing: border-box; }
  .mpdf-doc strong, .mpdf-doc b { font-weight: 700; font-style: normal; color: var(--mpdf-bold-color); }
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
    color: var(--mpdf-heading-color);
    margin: 0 0 ${Math.round(12 * hs)}px;
    line-height: 1.2;
    ${s.h1BorderBottom ? 'border-bottom: 2px solid var(--mpdf-accent); padding-bottom: 6px;' : ''}
    ${s.centerH1 ? 'text-align: center;' : ''}
  }
  .mpdf-doc h2 {
    font-size: ${Math.round(17 * hs)}px;
    font-weight: 600;
    color: var(--mpdf-heading-color);
    margin: ${Math.round(20 * hs)}px 0 ${Math.round(10 * hs)}px;
    ${s.h2BorderBottom ? 'border-bottom: 0.5px solid color-mix(in srgb, var(--mpdf-accent) 33%, transparent); padding-bottom: 5px;' : ''}
  }
  .mpdf-doc h3 {
    font-size: ${Math.round(15 * hs)}px;
    font-weight: 700;
    color: var(--mpdf-heading-color);
    margin: ${Math.round(16 * hs)}px 0 ${Math.round(8 * hs)}px;
    letter-spacing: 0.01em;
  }
  .mpdf-doc h4 { font-size: ${Math.round(13 * hs)}px; font-weight: 700; color: var(--mpdf-heading-color); margin: 12px 0 6px; text-transform: uppercase; letter-spacing: 0.04em; }
  .mpdf-doc h5 { font-size: ${Math.round(12 * hs)}px; font-weight: 600; color: var(--mpdf-heading-color); margin: 10px 0 4px; font-style: italic; }
  .mpdf-doc h6 { font-size: ${Math.round(11 * hs)}px; font-weight: 600; color: var(--mpdf-body-color); margin: 8px 0 4px; font-style: italic; opacity: 0.75; }
  .mpdf-doc p { margin: 0 0 var(--mpdf-paragraph-spacing); }
  .mpdf-doc ul, .mpdf-doc ol { padding-inline-start: 1.4em; margin: 0 0 var(--mpdf-paragraph-spacing); }
  .mpdf-doc li { margin-bottom: 0.2em; line-height: var(--mpdf-line-height); }
  .mpdf-doc blockquote {
    border-inline-start: 3px solid var(--mpdf-blockquote-border);
    background: var(--mpdf-blockquote-background);
    padding-block: 4px;
    padding-inline: 1em 0;
    margin: var(--mpdf-paragraph-spacing) 0;
    font-style: italic;
    color: color-mix(in srgb, var(--mpdf-body-color) 80%, transparent);
  }
  .mpdf-doc code {
    font-family: var(--mpdf-code-font);
    font-variant-ligatures: ${s.codeFontLigatures ? 'normal' : 'none'};
    font-size: var(--mpdf-code-font-size);
    background: var(--mpdf-code-background);
    padding: 1px 4px;
    border-radius: 3px;
    color: var(--mpdf-accent);
  }
  /* The rest of the elements the UA stylesheet puts on monospace. A
   * Document can carry any inline HTML — markdown-it runs with html: true
   * — so <kbd>, <samp> and <tt> are reachable without any markdown
   * syntax producing them, and without this rule their metrics came from
   * whatever monospace the host had while everything around them came from
   * the Document. Font only: the engine styles code, and whether these
   * should look like it is a design question, not a determinism one. */
  .mpdf-doc kbd, .mpdf-doc samp, .mpdf-doc tt {
    font-family: var(--mpdf-code-font);
  }
  ${buildCodeBlockCSS(s.codeFontLigatures)}
  .mpdf-doc hr {
    border: none;
    border-top: 0.5px solid color-mix(in srgb, var(--mpdf-accent) 27%, transparent);
    margin: calc(var(--mpdf-paragraph-spacing) * 1.5) 0;
  }
  .mpdf-doc img { max-width: 100%; height: auto; display: block; margin: var(--mpdf-paragraph-spacing) auto; }
  .mpdf-doc a { color: var(--mpdf-accent); ${s.linkUnderline ? '' : 'text-decoration: none;'} }
  .mpdf-doc table { width: 100%; border-collapse: collapse; margin: 0 0 var(--mpdf-paragraph-spacing); font-size: 0.92em; }
  .mpdf-doc th {
    background: var(--mpdf-table-header-background);
    color: ${tableHeaderTextColor};
    padding: 6px 10px;
    text-align: start;
    font-weight: 600;
    border: 0.5px solid color-mix(in srgb, var(--mpdf-accent) 20%, transparent);
    font-size: 0.9em;
  }
  .mpdf-doc td { padding: 5px 10px; border: 0.5px solid color-mix(in srgb, var(--mpdf-body-color) 13%, transparent); vertical-align: top; }
  ${s.tableStriped ? '.mpdf-doc tbody tr:nth-child(even) { background: color-mix(in srgb, var(--mpdf-table-header-background) 33%, transparent); }' : ''}

  /* GFM Alerts (GitHub-style > [!NOTE] blocks). One accent-styled design for
   * all five variants; the title band spans the full alert width via negative
   * margins against the container's content gutter. Accent-driven: with the
   * monochrome default style the alert is a graphite panel; presets and
   * custom accents color it with their own hue. (Document content, not
   * chrome — see DESIGN.md.) */
  .mpdf-doc .markdown-alert {
    border-inline-start: 4px solid var(--mpdf-accent);
    border-start-start-radius: 0;
    border-start-end-radius: 5px;
    border-end-end-radius: 5px;
    border-end-start-radius: 0;
    background: color-mix(in srgb, var(--mpdf-accent) 7%, transparent);
    margin: calc(var(--mpdf-paragraph-spacing) * 1.2) 0;
    padding: 0 14px 9px;
    overflow: hidden;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--mpdf-accent) 13%, transparent);
    font-style: normal;
  }
  .mpdf-doc .markdown-alert-title {
    display: flex;
    align-items: center;
    gap: 7px;
    margin: 0 -14px;
    padding: 7px 12px;
    background: color-mix(in srgb, var(--mpdf-accent) 16%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--mpdf-accent) 20%, transparent);
    font-family: var(--mpdf-font);
    font-size: 0.8em;
    font-weight: 800;
    font-style: normal;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--mpdf-accent);
    line-height: 1.3;
  }
  .mpdf-doc .markdown-alert-title svg {
    flex-shrink: 0;
    width: 15px;
    height: 15px;
    stroke: var(--mpdf-accent);
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
    border-inline-start-color: color-mix(in srgb, var(--mpdf-accent) 40%, transparent);
    background: transparent;
  }

  /* Mermaid diagrams — centre the SVG and prevent it overflowing the content
   * column.  The <style> block inside the SVG is intentionally left untouched;
   * mermaid embeds its own theme CSS there. */
  .mpdf-doc .mermaid {
    display: flex;
    justify-content: center;
    margin: var(--mpdf-paragraph-spacing) 0;
    overflow: hidden;
  }
  .mpdf-doc .mermaid svg { max-width: 100%; height: auto; display: block; }
  `.trim();

  // The Custom Stylesheet rides last so its rules win the cascade at equal
  // specificity against the generated ones — in the measurement sheet as much
  // as in the rendering sheet. Empty CSS (or the layer off) appends nothing.
  const customTail = () => {
    if (!s.customStylesheetEnabled || !s.customStylesheet.trim()) return '';
    const custom = escapeCSSForStyle(
      stripPageAtRules(s.customStylesheet),
    ).trim();
    return `\n\n/* Custom Stylesheet */\n${custom}`;
  };

  if (!geometry) return `${generated}${customTail()}`;
  const g = geometry;

  // The page-chrome rules: painted from the same sheet that carries the Custom
  // Stylesheet layer, so user CSS reaches the paper, the bands, and the frame —
  // either per-selector or by redefining a variable. Values ride on the page
  // box so both the box and its bands read them.
  const chrome = `
  .mpdf-page {
    /* The page chrome's style values — same contract as the content's. The
     * accent is mirrored here because the bands are not inside .mpdf-doc. */
    --mpdf-page-background: ${s.pageBackground};
    --mpdf-header-color: ${s.headerFontColor};
    --mpdf-footer-color: ${s.footerFontColor};
    --mpdf-frame-color: ${s.frameColor};
    --mpdf-accent: ${s.accentColor};
    --pm-margin-left: ${g.mLeft}px;
    --pm-margin-right: ${g.mRight}px;
    --pm-header-h: ${g.headerH}px;
    --pm-footer-h: ${g.footerH}px;
    --pm-band-top: ${g.mTop * 0.4}px;
    background: var(--mpdf-page-background);
  }
  .mpdf-page-header-text {
    font-size: ${s.headerFontSize}px;
    color: var(--mpdf-header-color);
    font-family: var(--mpdf-font);
    ${s.showHeaderBorder ? 'border-bottom:0.5px solid color-mix(in srgb, var(--mpdf-accent) 20%, transparent);' : ''}
  }
  .mpdf-page-footer-text {
    font-size: ${s.footerFontSize}px;
    color: var(--mpdf-footer-color);
    font-family: var(--mpdf-font);
    ${s.showFooterBorder ? 'border-top:0.5px solid color-mix(in srgb, var(--mpdf-accent) 20%, transparent);' : ''}
  }`.trim();

  // Only an enabled frame contributes a rule; a disabled one must leave no
  // trace for a stylesheet to fight with.
  const frameRule = s.frameEnabled
    ? `\n  .mpdf-page-frame { border: ${s.frameThickness}px ${s.frameStyle} var(--mpdf-frame-color); }`
    : '';

  return `${generated}\n\n/* Page chrome */\n${chrome}${frameRule}${customTail()}`;
}
