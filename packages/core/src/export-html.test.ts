// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import type { AssetResolver } from './assets';
import { buildExportHTML } from './export-html';
import { buildPageLayouts } from './paginator';
import { DEFAULT_SETTINGS, type DocumentSettings } from './settings';

const settings = (
  overrides: Partial<DocumentSettings> = {},
): DocumentSettings => ({
  ...DEFAULT_SETTINGS,
  ...overrides,
});

/** Fixed stand-in URLs so the golden output is byte-stable. */
const ASSET_URLS: Record<string, string> = {
  'assets/header-banner.png': 'data:image/png;base64,SEVBREVS',
  'assets/footer-banner.png': 'data:image/png;base64,Rk9PVEVS',
  'assets/paper-texture.png': 'data:image/png;base64,UEFQRVI=',
};
const resolveAssets: AssetResolver = (ref) => ASSET_URLS[ref];
const resolveNothing: AssetResolver = () => undefined;

/** Builds a detached element from an HTML fragment. */
const el = (html: string): HTMLElement => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};

/** Two pages of hand-built nodes run through the real layout builder. */
const twoPageLayouts = (s: DocumentSettings) =>
  buildPageLayouts(
    [
      [
        el('<h1 id="quarterly-report">Quarterly Report</h1>'),
        el('<p>First page content.</p>'),
      ],
      [el('<h2 id="details">Details</h2>'), el('<p>Second page content.</p>')],
    ],
    s,
    'Quarterly Report',
  );

// Everything the ticket's golden test asks for, plus the banner images and
// both header/footer borders: every decorative layer on, on both pages.
const goldenSettings = settings({
  headerText: 'PerfectMarkD — Quarterly Report',
  showHeaderBorder: true,
  footerText: 'Acme Corp · Confidential',
  showFooterBorder: true,
  headerImageRef: 'assets/header-banner.png',
  footerImageRef: 'assets/footer-banner.png',
  frameEnabled: true,
  backgroundImageEnabled: true,
  backgroundImageRef: 'assets/paper-texture.png',
});

describe('buildExportHTML', () => {
  it('golden: 2-page sample with header/footer/frame/background enabled', async () => {
    const layouts = twoPageLayouts(goldenSettings);
    const html = buildExportHTML(layouts, goldenSettings, resolveAssets, {
      title: 'Quarterly Report',
    });
    await expect(html).toMatchFileSnapshot('./export-html.golden.html');
    // Structural assertions documenting what the golden file must keep showing.
    const pages = html.match(/class="mpdf-export-page mpdf-page"/g) ?? [];
    expect(pages).toHaveLength(2);
    expect(html).toContain('@page { size: 794px 1123px; margin: 0; }');
    expect(html).toContain('-webkit-print-color-adjust: exact;');
    expect(html).toContain('print-color-adjust: exact;');
    expect(html).toContain('page-break-after: always; break-after: page;');
    expect(html).toContain(
      '.mpdf-export-page:last-child { page-break-after: avoid;',
    );
    expect(html).toContain('data:image/png;base64,UEFQRVI='); // background
    expect(html).toContain('data:image/png;base64,SEVBREVS'); // header banner
    expect(html).toContain('data:image/png;base64,Rk9PVEVS'); // footer banner
    // The frame border is painted by the .mpdf-page-frame sheet rule from the
    // frame-color variable — restylable by a Custom Stylesheet.
    expect(html).toContain(
      '.mpdf-page-frame { border: 4px solid var(--mpdf-frame-color); }',
    );
    expect(html).toContain('<title>Quarterly Report</title>');
  });

  it('throws on an empty layout list', () => {
    expect(() => buildExportHTML([], settings(), resolveNothing)).toThrow(
      /nothing to export/i,
    );
  });

  it('offsets content below the header band and pins its width to the content box', () => {
    const s = settings({
      headerText: 'Hello',
      headerHeight: 40,
      marginLeft: 10,
      marginRight: 20,
    });
    const html = buildExportHTML(twoPageLayouts(s), s, resolveNothing);
    const mTop = (20 / 25.4) * 96;
    expect(html).toContain(
      `top:${mTop + 40}px;left:${(10 / 25.4) * 96}px;width:${794 - (10 / 25.4) * 96 - (20 / 25.4) * 96}px;`,
    );
  });

  it('starts content at the top margin when the header band is disabled', () => {
    const s = settings({ showHeader: false, headerText: 'Hello' });
    const html = buildExportHTML(twoPageLayouts(s), s, resolveNothing);
    expect(html).toContain(`top:${(20 / 25.4) * 96}px;left:`);
    expect(html).not.toContain('PerfectMarkD'); // no header text anywhere
  });

  it('omits unresolved banner and background layers but keeps text bands', () => {
    const s = settings({
      headerText: 'Hello',
      headerImageRef: 'missing.png',
      footerImageRef: 'missing.png',
      backgroundImageEnabled: true,
      backgroundImageRef: 'missing.png',
    });
    const html = buildExportHTML(twoPageLayouts(s), s, resolveNothing);
    expect(html).not.toContain('background-image:url(');
    expect(html).toContain('>Hello</span>');
  });

  it('suppresses the footer (text, banner, page number) on a first page that hides it', () => {
    const s = settings({
      showFooterOnFirstPage: false,
      footerText: 'Bye',
      footerImageRef: 'assets/footer-banner.png',
    });
    const html = buildExportHTML(twoPageLayouts(s), s, resolveAssets);
    expect(html).toContain('data:image/png;base64,Rk9PVEVS'); // page 2 banner only
    expect(html).toContain('>1 / 1</span>'); // numbering shifts once, totals follow
    expect(html).not.toContain('0 / ');
  });

  it('switches the content div and doc CSS to RTL from the layout content', () => {
    const s = settings();
    const layouts = buildPageLayouts(
      [[el('<p>مرحبا بالعالم</p>')]],
      s,
      'Untitled',
    );
    const html = buildExportHTML(layouts, s, resolveNothing);
    expect(html).toContain('<div class="mpdf-doc" dir="rtl"');
    expect(html).toContain('direction: rtl;');
  });

  it('honours an explicit isRTL override over content-derived detection', () => {
    const s = settings();
    const html = buildExportHTML(twoPageLayouts(s), s, resolveNothing, {
      isRTL: true,
    });
    expect(html).toContain('<div class="mpdf-doc" dir="rtl"');
    const htmlLtr = buildExportHTML(
      buildPageLayouts([[el('<p>مرحبا</p>')]], s, 'Untitled'),
      s,
      resolveNothing,
      { isRTL: false },
    );
    expect(htmlLtr).not.toContain('direction: rtl;');
  });

  it('injects math CSS as its own style block before the print CSS', () => {
    const s = settings();
    const html = buildExportHTML(twoPageLayouts(s), s, resolveNothing, {
      mathCSS: '/* katex */',
    });
    const mathAt = html.indexOf('<style>/* katex */</style>');
    const printAt = html.indexOf('@page {');
    expect(mathAt).toBeGreaterThan(-1);
    expect(printAt).toBeGreaterThan(mathAt);
    expect(buildExportHTML(twoPageLayouts(s), s, resolveNothing)).not.toContain(
      '<style>/* katex */</style>',
    );
  });

  it('injects font-face CSS as its own style block, escaped, before the print CSS (billing/05)', () => {
    const s = settings();
    const fontCSS =
      '@font-face { font-family: "Inter"; src: url("data:font/woff2;base64,AAA") format("woff2"); }';
    const html = buildExportHTML(twoPageLayouts(s), s, resolveNothing, {
      fontFaceCSS: fontCSS,
    });
    const fontAt = html.indexOf(`<style>${fontCSS}</style>`);
    const printAt = html.indexOf('@page {');
    expect(fontAt).toBeGreaterThan(-1);
    expect(printAt).toBeGreaterThan(fontAt);
    // Omitted by default; a family name can't close the style block early —
    // the breakout sequence is escaped, so hostile text stays inert CSS.
    expect(buildExportHTML(twoPageLayouts(s), s, resolveNothing)).not.toContain(
      '@font-face',
    );
    const hostile = buildExportHTML(twoPageLayouts(s), s, resolveNothing, {
      fontFaceCSS: '</style><script>alert(1)</script>',
    });
    expect(hostile).toContain('<style><\\/style>');
  });

  it('escapes header and footer text', () => {
    const s = settings({ headerText: 'R&D <dept>', footerText: '"Q1" & more' });
    const html = buildExportHTML(twoPageLayouts(s), s, resolveNothing);
    expect(html).toContain('>R&amp;D &lt;dept&gt;</span>');
    expect(html).toContain('>&quot;Q1&quot; &amp; more</span>');
  });

  it('defaults the document title and escapes a custom one', () => {
    const s = settings();
    expect(buildExportHTML(twoPageLayouts(s), s, resolveNothing)).toContain(
      '<title>Export</title>',
    );
    const html = buildExportHTML(twoPageLayouts(s), s, resolveNothing, {
      title: 'A & "B"',
    });
    expect(html).toContain('<title>A &amp; &quot;B&quot;</title>');
  });

  it('omits the frame when disabled and positions it inset when enabled', () => {
    const s = settings();
    expect(buildExportHTML(twoPageLayouts(s), s, resolveNothing)).not.toContain(
      'pointer-events:none;box-sizing:border-box;',
    );
    const framed = buildExportHTML(
      twoPageLayouts(settings({ frameEnabled: true, frameMargin: 12 })),
      settings({ frameEnabled: true, frameMargin: 12 }),
      resolveNothing,
    );
    expect(framed).toContain('top:12px;left:12px;right:12px;bottom:12px;');
    expect(framed).toContain('class="mpdf-page-frame"');
  });

  it('sizes the background layer to the content box in content-only scope', () => {
    const s = settings({
      backgroundImageEnabled: true,
      backgroundImageRef: 'assets/paper-texture.png',
      backgroundImageScope: 'content-only',
      headerText: 'Hello',
      headerHeight: 40,
    });
    const html = buildExportHTML(twoPageLayouts(s), s, resolveAssets);
    const mTop = (20 / 25.4) * 96;
    const mLeft = (25 / 25.4) * 96;
    expect(html).toContain(
      `position:absolute;top:${mTop + 40}px;left:${mLeft}px;width:${794 - 2 * mLeft}px;`,
    );
    expect(html).not.toContain('inset:0;');
  });

  it('paints the paper, bands, and frame from the sheet so a Custom Stylesheet can restyle them', () => {
    const s = settings({
      frameEnabled: true,
      customStylesheet:
        '.mpdf-page { --mpdf-page-background: #101018; } .mpdf-page-header-text { color: #8be9fd; }',
      customStylesheetEnabled: true,
    });
    const html = buildExportHTML(twoPageLayouts(s), s, resolveNothing);
    // The page box carries the chrome scope; the sheet paints it.
    expect(html).toContain('class="mpdf-export-page mpdf-page"');
    expect(html).toContain('background: var(--mpdf-page-background);');
    expect(html).not.toContain('background:#ffffff;');
    // The user's override lands after the chrome rules in the print CSS.
    expect(html.indexOf('--mpdf-page-background: #101018;')).toBeGreaterThan(
      html.indexOf('/* Page chrome */'),
    );
  });

  it('carries the Custom Stylesheet in the print CSS, stripped of @page (ai-transforms/01)', () => {
    const s = settings({
      customStylesheet:
        '@page { size: 300px 300px; } .mpdf-doc h2 { letter-spacing: 0.3em; }',
      customStylesheetEnabled: true,
    });
    const html = buildExportHTML(twoPageLayouts(s), s, resolveNothing);
    // The user's rule reaches the print document…
    expect(html).toContain('.mpdf-doc h2 { letter-spacing: 0.3em; }');
    // …while the settings' own @page sizing is the only @page left, so the
    // printed page geometry is the Page tab's, never the stylesheet's.
    expect(html.match(/@page \{/g)).toHaveLength(1);
    expect(html).toContain('@page { size: 794px 1123px; margin: 0; }');
    // Layer off: the rule is gone from the print document entirely.
    const off = buildExportHTML(
      twoPageLayouts({ ...s, customStylesheetEnabled: false }),
      { ...s, customStylesheetEnabled: false },
      resolveNothing,
    );
    expect(off).not.toContain('letter-spacing: 0.3em');
  });
});
