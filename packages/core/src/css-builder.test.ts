import { describe, expect, it } from 'vitest';
import {
  bgImageCssProps,
  buildCodeBlockCSS,
  buildDocCSS,
  buildFrameOverlayHTML,
  escapeCSSForStyle,
  escapeHTML,
  frameBorderCSS,
  hexLuminance,
  mmToPx,
  resolveCodeFont,
  resolveFont,
  resolvePageDims,
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
    expect(frameBorderCSS(DEFAULT_SETTINGS)).toBe('4px solid #000000');
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
    expect(html).toContain('border:4px solid #000000');
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
    expect(on).toContain('border-bottom: 2px solid #7c6af7');
    expect(on).toContain('text-align: center');
  });

  it('styles inline code from the settings', () => {
    const css = buildDocCSS(DEFAULT_SETTINGS);
    expect(css).toContain('.mpdf-doc code {');
    expect(css).toContain('background: #f0f0f8');
    expect(css).toContain('color: #7c6af7');
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
