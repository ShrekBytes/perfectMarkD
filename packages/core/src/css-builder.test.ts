import { describe, expect, it } from 'vitest';
import {
  bgImageCssProps,
  buildCodeBlockCSS,
  buildFontFaceCSS,
  buildDocCSS,
  buildFrameOverlayHTML,
  escapeCSSForStyle,
  escapeHTML,
  frameBorderCSS,
  hexLuminance,
  mmToPx,
  resolveCodeFont,
  resolveFont,
  customFontFamilies,
  resolvePageDims,
  resolvePageGeometry,
  stripPageAtRules,
} from './css-builder';
import {
  DEFAULT_SETTINGS,
  PAGE_SIZES,
  type DocumentSettings,
} from './settings';

const settings = (overrides: Partial<DocumentSettings>): DocumentSettings => ({
  ...DEFAULT_SETTINGS,
  ...overrides,
});

describe('mmToPx', () => {
  it('converts millimetres to px at 96 dpi', () => {
    expect(mmToPx(25.4)).toBe(96);
    expect(mmToPx(210)).toBeCloseTo(793.7, 1);
  });
});

describe('resolvePageDims', () => {
  it('looks up named sizes from PAGE_SIZES', () => {
    expect(resolvePageDims(settings({ pageSize: 'A4' }))).toEqual(
      PAGE_SIZES.A4,
    );
    expect(resolvePageDims(settings({ pageSize: 'Letter' }))).toEqual({
      w: 816,
      h: 1056,
    });
  });

  it('converts custom mm dimensions with rounding to whole px', () => {
    // 210×297 mm is A4; must round to exactly the named A4 px size.
    expect(
      resolvePageDims(
        settings({
          pageSize: 'Custom',
          customPageWidth: 210,
          customPageHeight: 297,
        }),
      ),
    ).toEqual(PAGE_SIZES.A4);
  });

  it('clamps custom dimensions to at least 1px', () => {
    expect(
      resolvePageDims(
        settings({
          pageSize: 'Custom',
          customPageWidth: 0,
          customPageHeight: -10,
        }),
      ),
    ).toEqual({ w: 1, h: 1 });
  });

  it('falls back to A4 for unknown page size names', () => {
    expect(resolvePageDims(settings({ pageSize: 'Quarto' }))).toEqual(
      PAGE_SIZES.A4,
    );
  });

  it('ignores orientation — swapping is the caller’s job', () => {
    expect(
      resolvePageDims(settings({ pageSize: 'A4', orientation: 'landscape' })),
    ).toEqual({
      w: 794,
      h: 1123,
    });
  });
});

describe('escapeHTML', () => {
  it('escapes all five HTML-significant characters', () => {
    expect(escapeHTML(`<a href="x">&'`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;',
    );
  });

  it('leaves plain text untouched', () => {
    expect(escapeHTML('plain text 123')).toBe('plain text 123');
  });
});

describe('escapeCSSForStyle', () => {
  it('neutralises </style> so the <style> block cannot end early', () => {
    expect(escapeCSSForStyle('p::before { content: "</style>" }')).toBe(
      'p::before { content: "<\\/style>" }',
    );
  });

  it('is case-insensitive', () => {
    expect(escapeCSSForStyle('</STYLE>')).toBe('<\\/style>');
  });

  it('leaves ordinary CSS untouched', () => {
    const css = '.mpdf-doc { color: #fff; background: url(a.png); }';
    expect(escapeCSSForStyle(css)).toBe(css);
  });
});

describe('bgImageCssProps', () => {
  it('maps every backgroundImageSize value to CSS props', () => {
    expect(bgImageCssProps('cover')).toEqual({
      size: 'cover',
      repeat: 'no-repeat',
    });
    expect(bgImageCssProps('contain')).toEqual({
      size: 'contain',
      repeat: 'no-repeat',
    });
    expect(bgImageCssProps('fill')).toEqual({
      size: '100% 100%',
      repeat: 'no-repeat',
    });
    expect(bgImageCssProps('tile')).toEqual({ size: 'auto', repeat: 'repeat' });
  });
});

describe('hexLuminance', () => {
  it('returns 0 for black and 1 for white', () => {
    expect(hexLuminance('#000000')).toBe(0);
    expect(hexLuminance('#ffffff')).toBe(1);
  });

  it('expands 3-digit hex like #abc to #aabbcc', () => {
    expect(hexLuminance('#abc')).toBe(hexLuminance('#aabbcc'));
  });

  it('treats non-hex values as light', () => {
    expect(hexLuminance('transparent')).toBe(1);
    expect(hexLuminance('rgb(0,0,0)')).toBe(1);
  });

  it('separates mid greys from the dark-text threshold', () => {
    expect(hexLuminance('#888888')).toBeLessThan(0.35);
    expect(hexLuminance('#888888')).toBeGreaterThan(0.2);
  });

  it('reads preset table-header backgrounds as dark', () => {
    expect(hexLuminance('#1e293b')).toBeLessThan(0.35);
  });
});

describe('font resolvers', () => {
  it('resolveFont passes named fonts through', () => {
    expect(resolveFont(DEFAULT_SETTINGS)).toBe('Georgia, serif');
  });

  it('resolveFont trims and uses the custom font name', () => {
    expect(
      resolveFont(
        settings({ fontFamily: '__custom__', customFontName: ' Steampunk ' }),
      ),
    ).toBe('Steampunk');
  });

  it('resolveFont falls back to inherit for a blank custom name', () => {
    expect(
      resolveFont(settings({ fontFamily: '__custom__', customFontName: '' })),
    ).toBe('inherit');
  });

  it('resolveCodeFont passes named fonts through', () => {
    expect(resolveCodeFont(DEFAULT_SETTINGS)).toBe("'Courier New', monospace");
  });

  it('resolveCodeFont falls back to a monospace stack for a blank custom name', () => {
    expect(
      resolveCodeFont(
        settings({ codeFontFamily: '__custom__', customCodeFontName: '  ' }),
      ),
    ).toBe("'Courier New', monospace");
  });
});

describe('frame helpers', () => {
  it('frameBorderCSS builds the shorthand border value', () => {
    expect(frameBorderCSS(DEFAULT_SETTINGS)).toBe('4px solid #1c1e21');
    expect(
      frameBorderCSS(
        settings({
          frameThickness: 2,
          frameStyle: 'dashed',
          frameColor: '#f00',
        }),
      ),
    ).toBe('2px dashed #f00');
  });

  it('buildFrameOverlayHTML is empty when the frame is disabled', () => {
    expect(buildFrameOverlayHTML(DEFAULT_SETTINGS)).toBe('');
  });

  it('buildFrameOverlayHTML insets an absolutely-positioned bordered div', () => {
    const html = buildFrameOverlayHTML(settings({ frameEnabled: true }));
    expect(html).toContain('position:absolute');
    expect(html).toContain('top:8px');
    expect(html).toContain('left:8px');
    expect(html).toContain('right:8px');
    expect(html).toContain('bottom:8px');
    expect(html).toContain('pointer-events:none');
    expect(html).toContain('border:4px solid #1c1e21');
  });
});

describe('buildCodeBlockCSS', () => {
  it('styles pre blocks from the settings code background', () => {
    const css = buildCodeBlockCSS(settings({ codeBackground: '#eef2ff' }));
    expect(css).toContain('.mpdf-doc pre {');
    expect(css).toContain('background: #eef2ff');
    expect(css).toContain('.mpdf-doc pre code {');
    expect(css).toContain('white-space: pre-wrap');
  });

  it('applies the resolved code font and size', () => {
    const css = buildCodeBlockCSS(DEFAULT_SETTINGS);
    expect(css).toContain("font-family: 'Courier New', monospace");
    expect(css).toContain('font-size: 0.85em');
  });

  it('toggles ligatures with the setting', () => {
    expect(buildCodeBlockCSS(DEFAULT_SETTINGS)).toContain(
      'font-variant-ligatures: none',
    );
    expect(buildCodeBlockCSS(settings({ codeFontLigatures: true }))).toContain(
      'font-variant-ligatures: normal',
    );
  });

  it('falls back to the body color for plain code text', () => {
    const css = buildCodeBlockCSS(settings({ bodyColor: '#123456' }));
    expect(css).toContain('color: #123456');
  });

  it('is theme-agnostic: the code theme never injects colors', () => {
    const css = buildCodeBlockCSS(
      settings({ codeTheme: 'dracula', codeBackground: '#f5f5f5' }),
    );
    expect(css).toContain('background: #f5f5f5');
    expect(css).not.toContain('#bd93f9');
    expect(css).not.toContain('.token');
  });
});

describe('buildDocCSS', () => {
  it('produces a trimmed stylesheet with no leading/trailing whitespace', () => {
    const css = buildDocCSS(DEFAULT_SETTINGS);
    expect(css).toBe(css.trim());
  });

  it('styles the document root from the settings', () => {
    const css = buildDocCSS(DEFAULT_SETTINGS);
    expect(css).toContain('.mpdf-doc {');
    expect(css).toContain('font-family: Georgia, serif');
    expect(css).toContain('font-size: 13px');
    expect(css).toContain('line-height: 1.85');
    expect(css).toContain('color: #1a1a2e');
  });

  it('scales heading sizes by headingScale', () => {
    const css = buildDocCSS(settings({ headingScale: 1.05 }));
    expect(css).toContain('font-size: 23px'); // h1: round(22 × 1.05)
    expect(css).toContain('font-size: 18px'); // h2: round(17 × 1.05)
  });

  it('adds the h1 underline and centered title only when enabled', () => {
    const off = buildDocCSS(DEFAULT_SETTINGS);
    expect(off).not.toContain('border-bottom: 2px solid');
    expect(off).not.toContain('text-align: center');

    const on = buildDocCSS(settings({ h1BorderBottom: true, centerH1: true }));
    expect(on).toContain('border-bottom: 2px solid #1c1e21');
    expect(on).toContain('text-align: center');
  });

  it('styles inline code from the settings', () => {
    const css = buildDocCSS(DEFAULT_SETTINGS);
    expect(css).toContain('.mpdf-doc code {');
    expect(css).toContain('background: #f0f1f2');
    expect(css).toContain('color: #1c1e21');
  });

  it('uses white text on dark table headers and the heading color on light ones', () => {
    expect(buildDocCSS(DEFAULT_SETTINGS)).toContain('color: #0d0d1a');
    expect(buildDocCSS(settings({ tableHeaderBg: '#1e293b' }))).toContain(
      'color: #fff',
    );
  });

  it('includes the striped table rule only when tableStriped is on', () => {
    expect(buildDocCSS(DEFAULT_SETTINGS)).toContain('tbody tr:nth-child(even)');
    expect(buildDocCSS(settings({ tableStriped: false }))).not.toContain(
      'tbody tr:nth-child(even)',
    );
  });

  it('renders GFM alert styling for markdown-alert classes', () => {
    const css = buildDocCSS(DEFAULT_SETTINGS);
    expect(css).toContain('.markdown-alert {');
    expect(css).toContain('.markdown-alert-title {');
    expect(css).toContain('.markdown-alert-title svg {');
    expect(css).toContain('text-transform: uppercase');
  });

  it('keeps no trace of Obsidian callouts, Prism tokens, or MathJax', () => {
    const css = buildDocCSS(DEFAULT_SETTINGS);
    expect(css).not.toContain('callout');
    expect(css).not.toContain('.token');
    expect(css).not.toContain('MathJax');
    expect(css).not.toContain('mjx');
    expect(css).not.toContain('!important');
  });

  it('sets RTL direction only when requested', () => {
    expect(buildDocCSS(DEFAULT_SETTINGS)).not.toContain('direction: rtl');
    expect(buildDocCSS(DEFAULT_SETTINGS, true)).toContain('direction: rtl;');
  });
});

// ─── Custom Stylesheet layer (ai-transforms/01) ──────────────────────────────

describe('stripPageAtRules', () => {
  it('strips a plain @page block and keeps the surrounding rules', () => {
    const css =
      'p { margin: 0; }\n@page { size: A3 landscape; margin: 2cm; }\nh2 { color: red; }';
    expect(stripPageAtRules(css)).toBe(
      'p { margin: 0; }\n\nh2 { color: red; }',
    );
  });

  it('strips @page rules with pseudo-page selectors', () => {
    const css = '@page :first { margin: 0; } body { color: blue; }';
    expect(stripPageAtRules(css)).toBe(' body { color: blue; }');
  });

  it('strips @page blocks with nested margin-box braces', () => {
    const css =
      '@page { size: 300px 300px; @top-center { content: "x"; } } h1 { margin: 0; }';
    expect(stripPageAtRules(css)).toBe(' h1 { margin: 0; }');
  });

  it('is case-insensitive and matches the token, not a prefix', () => {
    expect(stripPageAtRules('@PAGE { size: A3; } a { b: c; }')).toBe(
      ' a { b: c; }',
    );
    // @pagex is not an @page rule.
    expect(stripPageAtRules('@pagex { size: A3; }')).toBe(
      '@pagex { size: A3; }',
    );
  });

  it('strips a malformed blockless rule to its semicolon', () => {
    expect(stripPageAtRules('@page; a { b: c; }')).toBe(' a { b: c; }');
  });

  it('strips an unclosed @page block to the end of the text', () => {
    expect(stripPageAtRules('a { b: c; } @page { size: A3')).toBe(
      'a { b: c; } ',
    );
  });

  it('leaves @page inside a comment or string alone', () => {
    const commented = '/* use @page { size: A3 } here */ p { margin: 0; }';
    expect(stripPageAtRules(commented)).toBe(commented);
    const inString = '.mpdf-doc::after { content: "@page { size: A3 }"; }';
    expect(stripPageAtRules(inString)).toBe(inString);
  });

  it('leaves ordinary CSS untouched', () => {
    const css = '.mpdf-doc h2 { color: #123456; }\n@media print { p { } }';
    expect(stripPageAtRules(css)).toBe(css);
  });
});

describe('buildDocCSS — Custom Stylesheet layer', () => {
  const customCSS = '.mpdf-doc h2 { color: #123456; }';

  it('appends the stylesheet after the generated rules when the layer is on', () => {
    const css = buildDocCSS(
      settings({
        customStylesheet: customCSS,
        customStylesheetEnabled: true,
      }),
    );
    expect(css).toContain('/* Custom Stylesheet */');
    expect(css).toContain(customCSS);
    // After — not interleaved with — the generated rules.
    expect(css.indexOf(customCSS)).toBeGreaterThan(
      css.indexOf('.mpdf-doc .mermaid svg'),
    );
  });

  it('appends nothing when the layer is off or the CSS is blank', () => {
    const base = buildDocCSS(DEFAULT_SETTINGS);
    expect(
      buildDocCSS(
        settings({
          customStylesheet: customCSS,
          customStylesheetEnabled: false,
        }),
      ),
    ).toBe(base);
    expect(
      buildDocCSS(
        settings({ customStylesheet: '  \n ', customStylesheetEnabled: true }),
      ),
    ).toBe(base);
  });

  it('strips @page rules from the appended stylesheet', () => {
    const css = buildDocCSS(
      settings({
        customStylesheet:
          '@page { size: 300px 300px; } .mpdf-doc p { margin: 0; }',
        customStylesheetEnabled: true,
      }),
    );
    expect(css).not.toContain('@page');
    expect(css).not.toContain('300px 300px');
    expect(css).toContain('.mpdf-doc p { margin: 0; }');
  });

  it('neutralizes </style> sequences in the appended stylesheet', () => {
    const css = buildDocCSS(
      settings({
        customStylesheet: `.mpdf-doc::after { content: "</style>"; }`,
        customStylesheetEnabled: true,
      }),
    );
    expect(css).toContain('<\\/style>');
    expect(css).not.toContain('</style>');
  });

  it('keeps the layer out of the generated rules: off and on differ only in the tail', () => {
    const off = buildDocCSS(DEFAULT_SETTINGS);
    const on = buildDocCSS(
      settings({
        customStylesheet: customCSS,
        customStylesheetEnabled: true,
      }),
    );
    expect(on.startsWith(off)).toBe(true);
  });
});

describe('resolvePageGeometry', () => {
  it('derives A4 portrait geometry from the default settings', () => {
    const g = resolvePageGeometry(DEFAULT_SETTINGS);
    expect(g.pw).toBe(794);
    expect(g.ph).toBe(1123);
    expect(g.mTop).toBeCloseTo(mmToPx(20), 10);
    expect(g.mBottom).toBeCloseTo(mmToPx(20), 10);
    expect(g.mLeft).toBeCloseTo(mmToPx(25), 10);
    expect(g.mRight).toBeCloseTo(mmToPx(25), 10);
    // Default header has no text, border, or banner → no band.
    expect(g.headerH).toBe(0);
    // Default footer shows page numbers → auto band height max(28, 9 + 14).
    expect(g.footerH).toBe(28);
    expect(g.contentW).toBeCloseTo(794 - mmToPx(50), 10);
    expect(g.contentH).toBeCloseTo(1123 - mmToPx(40) - 28, 10);
  });

  it('swaps page dimensions in landscape', () => {
    const g = resolvePageGeometry(settings({ orientation: 'landscape' }));
    expect(g.pw).toBe(1123);
    expect(g.ph).toBe(794);
  });

  it('auto-derives band heights from font size when not set explicitly', () => {
    const g = resolvePageGeometry(
      settings({ headerText: 'Hello', footerText: 'Bye' }),
    );
    expect(g.headerH).toBe(20); // max(20, 9 + 10)
    expect(g.footerH).toBe(28); // max(28, 9 + 14)
    const gBig = resolvePageGeometry(
      settings({
        headerText: 'Hello',
        headerFontSize: 14,
        footerText: 'Bye',
        footerFontSize: 20,
      }),
    );
    expect(gBig.headerH).toBe(24); // 14 + 10
    expect(gBig.footerH).toBe(34); // 20 + 14
  });

  it('prefers explicit band heights over the auto-derived ones', () => {
    const g = resolvePageGeometry(
      settings({
        headerText: 'Hello',
        headerHeight: 48,
        footerText: 'Bye',
        footerHeight: 60,
      }),
    );
    expect(g.headerH).toBe(48);
    expect(g.footerH).toBe(60);
  });

  it('drops bands whose header/footer is fully disabled', () => {
    const noHeader = resolvePageGeometry(
      settings({ showHeader: false, headerText: 'Hello' }),
    );
    expect(noHeader.headerH).toBe(0);
    const noFooter = resolvePageGeometry(
      settings({ showFooter: false, footerText: 'Bye', showPageNumbers: true }),
    );
    expect(noFooter.footerH).toBe(0);
  });

  it('keeps a band alive for a banner alone (no text, no border)', () => {
    const g = resolvePageGeometry(settings({ headerImageRef: 'banner.png' }));
    expect(g.headerH).toBe(20);
  });

  it('clamps the content box to at least 1px when margins overflow the page', () => {
    const g = resolvePageGeometry(
      settings({
        pageSize: 'A5',
        marginLeft: 200,
        marginRight: 200,
        marginTop: 300,
        marginBottom: 300,
      }),
    );
    expect(g.contentW).toBe(1);
    expect(g.contentH).toBe(1);
  });

  it('converts custom mm page sizes through resolvePageDims', () => {
    const g = resolvePageGeometry(
      settings({
        pageSize: 'Custom',
        customPageWidth: 210,
        customPageHeight: 297,
      }),
    );
    expect(g.pw).toBe(794); // round(210 / 25.4 * 96)
    expect(g.ph).toBe(1123); // round(297 / 25.4 * 96)
  });
});

// ─── Custom font families (billing/05) ───────────────────────────────────────

describe('customFontFamilies', () => {
  it('reports the body family when the body font is custom', () => {
    expect(
      customFontFamilies(
        settings({ fontFamily: '__custom__', customFontName: 'Inter' }),
      ),
    ).toEqual(['Inter']);
  });

  it('reports the code family when the code font is custom', () => {
    expect(
      customFontFamilies(
        settings({
          codeFontFamily: '__custom__',
          customCodeFontName: 'Fira Code',
        }),
      ),
    ).toEqual(['Fira Code']);
  });

  it('reports both families, deduplicated, in body-then-code order', () => {
    expect(
      customFontFamilies(
        settings({
          fontFamily: '__custom__',
          customFontName: 'Inter',
          codeFontFamily: '__custom__',
          customCodeFontName: 'Inter',
        }),
      ),
    ).toEqual(['Inter']);
    expect(
      customFontFamilies(
        settings({
          fontFamily: '__custom__',
          customFontName: 'Inter',
          codeFontFamily: '__custom__',
          customCodeFontName: 'Fira Code',
        }),
      ),
    ).toEqual(['Inter', 'Fira Code']);
  });

  it('is empty when no sentinel is set, and ignores blank names', () => {
    expect(customFontFamilies(settings({}))).toEqual([]);
    expect(
      customFontFamilies(
        settings({ fontFamily: '__custom__', customFontName: '   ' }),
      ),
    ).toEqual([]);
  });
});

// ─── Font-face CSS assembly (billing/05) ─────────────────────────────────────

describe('buildFontFaceCSS', () => {
  it('emits one @font-face rule per face with a format hint', () => {
    const css = buildFontFaceCSS([
      {
        family: 'Inter',
        url: 'data:font/woff2;base64,AAA',
        format: 'woff2',
      },
    ]);
    expect(css).toBe(
      '@font-face { font-family: "Inter"; src: url("data:font/woff2;base64,AAA") format("woff2"); }',
    );
  });

  it('omits the format clause when no hint is given', () => {
    const css = buildFontFaceCSS([
      { family: 'Inter', url: 'data:font/ttf;base64,AAA' },
    ]);
    expect(css).toBe(
      '@font-face { font-family: "Inter"; src: url("data:font/ttf;base64,AAA"); }',
    );
  });

  it('escapes quote characters in family names so a file name cannot break the rule', () => {
    const css = buildFontFaceCSS([
      { family: 'My "Fancy" Font', url: 'data:font/ttf;base64,AAA' },
    ]);
    expect(css).toContain('font-family: "My \\"Fancy\\" Font"');
  });

  it('returns an empty string for an empty face list', () => {
    expect(buildFontFaceCSS([])).toBe('');
  });
});
