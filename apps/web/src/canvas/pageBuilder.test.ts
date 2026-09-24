// @vitest-environment jsdom
import {
  DEFAULT_SETTINGS,
  buildDocCSS,
  type AssetResolver,
  type DocumentSettings,
  type PageGeometry,
  type PageLayout,
} from '@perfectmarkd/core';
import { describe, expect, it } from 'vitest';
import { buildPage, createPageSheets } from './pageBuilder';

const GEOMETRY: PageGeometry = {
  pw: 794,
  ph: 1123,
  mTop: 75.6,
  mBottom: 75.6,
  mLeft: 94.5,
  mRight: 94.5,
  headerH: 19,
  footerH: 23,
  contentW: 605,
  contentH: 929.8,
};

/** Resolver over a fixed ref → URL map; unknown refs are unresolvable. */
function stubResolver(map: Record<string, string | undefined>): AssetResolver {
  return (ref) => map[ref];
}

function makeLayout(overrides: Partial<PageLayout> = {}): PageLayout {
  return {
    pageNodes: [],
    pageNum: 1,
    totalPages: 1,
    pageShowsHeader: true,
    pageShowsFooter: true,
    hasHeader: false,
    hasFooter: false,
    headerLeft: '',
    headerCenter: '',
    headerRight: '',
    footerLeft: '',
    footerCenter: '',
    footerRight: '',
    ...overrides,
  };
}

function para(text: string): HTMLElement {
  const p = document.createElement('p');
  p.textContent = text;
  return p;
}

function build(
  layout: PageLayout,
  settings: DocumentSettings = DEFAULT_SETTINGS,
  assets: AssetResolver = stubResolver({}),
  isRTL = false,
) {
  // The real sheet for these settings, chrome section included — what the
  // Paper Canvas adopts in production.
  const sheets = createPageSheets(
    buildDocCSS(settings, isRTL, GEOMETRY),
    '.katex { x: y; }',
  );
  return {
    sheets,
    ...buildPage({
      layout,
      settings,
      geometry: GEOMETRY,
      sheets,
      assets,
      isRTL,
    }),
  };
}

/** The page box: the single element inside the shadow root. */
function boxOf(host: HTMLDivElement): HTMLElement {
  return host.shadowRoot!.firstElementChild as HTMLElement;
}

function layer(host: HTMLDivElement, name: string): HTMLElement | null {
  return boxOf(host).querySelector(`[data-pm-layer="${name}"]`);
}

describe('createPageSheets', () => {
  it('builds constructable sheets ordered math-first so docCSS wins ties', () => {
    const sheets = createPageSheets('.mpdf-doc{}', '.katex{}');
    expect(sheets).toHaveLength(2);
    expect(sheets[0]!.cssRules[0]!.cssText).toContain('.katex');
    expect(sheets[1]!.cssRules[0]!.cssText).toContain('.mpdf-doc');
  });
});

describe('buildPage', () => {
  it('creates an open shadow root adopting the shared sheets', () => {
    const { host, sheets } = build(makeLayout());
    expect(host.shadowRoot).not.toBeNull();
    expect(host.shadowRoot!.adoptedStyleSheets).toEqual([sheets[0], sheets[1]]);
  });

  it('sizes the page box from the geometry and scopes it for the chrome rules', () => {
    const { host } = build(makeLayout());
    const box = boxOf(host);
    expect(box.style.width).toBe('794px');
    expect(box.style.height).toBe('1123px');
    expect(box.style.overflow).toBe('hidden');
    // The paper is painted by the shared .mpdf-page sheet rule (the Custom
    // Stylesheet can override it), not by an inline style.
    expect(box.className).toContain('mpdf-page');
    expect(box.getAttribute('style')).not.toContain('background');
  });

  it('paints the paper background from the sheet, overridable per page', () => {
    const { sheets } = build(makeLayout());
    const cssText = sheets
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .map((rule) => rule.cssText)
      .join('\n');
    expect(cssText).toContain('.mpdf-page');
    expect(cssText).toContain('--mpdf-page-background: #ffffff');
  });

  it('appends the layout page nodes into the mpdf-doc content root', () => {
    const nodes = [para('one'), para('two')];
    const { contentRoot } = build(makeLayout({ pageNodes: nodes }));
    expect(contentRoot.className).toBe('mpdf-doc');
    // Nodes are consumed, not copied — same identity as the layout's.
    expect(contentRoot.children).toHaveLength(2);
    expect(contentRoot.firstElementChild).toBe(nodes[0]);
  });

  it('positions the content root in the content box below the header band', () => {
    const { contentRoot } = build(
      makeLayout({ hasHeader: true, headerRight: 'head' }),
    );
    // top = mTop + headerH = 75.6 + 19
    expect(contentRoot.style.top).toBe('94.6px');
    expect(contentRoot.style.left).toBe('94.5px');
    expect(contentRoot.style.width).toBe('605px');
  });

  it('sets dir=rtl on the content root when isRTL', () => {
    const { contentRoot } = build(
      makeLayout(),
      DEFAULT_SETTINGS,
      stubResolver({}),
      true,
    );
    expect(contentRoot.getAttribute('dir')).toBe('rtl');
  });

  it('renders a centered header span when center text is set', () => {
    const { host } = build(
      makeLayout({ hasHeader: true, headerCenter: 'Centered' }),
    );
    const header = layer(host, 'header-text')!;
    expect(header.textContent).toBe('Centered');
    expect(header.style.alignItems).toBe('center');
    // Band geometry reads the page-box variables — the numbers ride in the
    // sheet's .mpdf-page rule, so both stay overridable together.
    expect(header.style.top).toBe('var(--pm-band-top)');
    expect(header.firstElementChild!.getAttribute('style')).toContain(
      'text-align:center',
    );
  });

  it('renders left and right header spans with the right pushed over', () => {
    const { host } = build(
      makeLayout({ hasHeader: true, headerLeft: 'L', headerRight: 'R' }),
    );
    const header = layer(host, 'header-text')!;
    const spans = Array.from(header.children) as HTMLElement[];
    expect(spans).toHaveLength(2);
    const [left, right] = spans;
    expect(left!.textContent).toBe('L');
    expect(right!.textContent).toBe('R');
    expect(right!.getAttribute('style')).toContain('margin-left:auto');
  });

  it('adds the header border when showHeaderBorder is on', () => {
    const s = { ...DEFAULT_SETTINGS, showHeaderBorder: true };
    const { host, sheets } = build(makeLayout({ hasHeader: true }), s);
    const header = layer(host, 'header-text')!;
    // The band's class hooks the shared sheet rule that paints the border.
    expect(header.className).toBe('mpdf-page-header-text');
    const cssText = sheets
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .map((rule) => rule.cssText)
      .join('\n');
    expect(cssText).toContain('.mpdf-page-header-text');
    expect(cssText).toContain('border-bottom');
  });

  it('renders the footer band pinned to the bottom with page padding', () => {
    const { host } = build(makeLayout({ hasFooter: true, footerLeft: 'foot' }));
    const footer = layer(host, 'footer-text')!;
    expect(footer.style.bottom).toBe('0px');
    // Assert the raw cssText: jsdom's CSSOM drops var() inside shorthands,
    // while real Chromium resolves them from the .mpdf-page rule.
    const css = footer.getAttribute('style') ?? '';
    expect(css).toContain(
      'padding: 0 var(--pm-margin-right) 0 var(--pm-margin-left)',
    );
    expect(css).toContain('height: var(--pm-footer-h)');
    expect(footer.textContent).toBe('foot');
  });

  it('adds the footer border when showFooterBorder is on', () => {
    const s = { ...DEFAULT_SETTINGS, showFooterBorder: true };
    const { host, sheets } = build(makeLayout({ hasFooter: true }), s);
    expect(layer(host, 'footer-text')!.className).toBe('mpdf-page-footer-text');
    const cssText = sheets
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .map((rule) => rule.cssText)
      .join('\n');
    expect(cssText).toContain('border-top');
  });

  it('omits header/footer bands the layout marks off', () => {
    const { host } = build(makeLayout());
    expect(layer(host, 'header-text')).toBeNull();
    expect(layer(host, 'footer-text')).toBeNull();
  });

  it('layers background → banners → header → content → footer → frame', () => {
    const s: DocumentSettings = {
      ...DEFAULT_SETTINGS,
      headerImageRef: 'asset://head',
      footerImageRef: 'asset://foot',
      backgroundImageEnabled: true,
      backgroundImageRef: 'asset://bg',
      frameEnabled: true,
    };
    const assets = stubResolver({
      'asset://head': 'blob:head',
      'asset://foot': 'blob:foot',
      'asset://bg': 'blob:bg',
    });
    const { host } = build(
      makeLayout({
        hasHeader: true,
        headerRight: 'h',
        hasFooter: true,
        footerLeft: 'f',
      }),
      s,
      assets,
    );
    const order = Array.from(boxOf(host).children).map(
      (el) => (el as HTMLElement).dataset.pmLayer,
    );
    expect(order).toEqual([
      'background',
      'header-banner',
      'header-text',
      'content',
      'footer-banner',
      'footer-text',
      'frame',
    ]);
  });

  it('resolves banner refs to URLs and skips unresolvable ones', () => {
    const s = {
      ...DEFAULT_SETTINGS,
      headerImageRef: 'asset://head',
      footerImageRef: 'asset://foot',
    };
    const assets = stubResolver({ 'asset://head': 'blob:head' });
    const { host } = build(makeLayout(), s, assets);
    const banner = layer(host, 'header-banner')!;
    expect(banner.style.backgroundImage).toContain('blob:head');
    expect(banner.style.backgroundSize).toBe('cover');
    expect(layer(host, 'footer-banner')).toBeNull();
  });

  it('drops banner layers when their band is disabled', () => {
    const s = {
      ...DEFAULT_SETTINGS,
      showHeader: false,
      headerImageRef: 'asset://head',
    };
    const { host } = build(
      makeLayout(),
      s,
      stubResolver({ 'asset://head': 'blob:head' }),
    );
    expect(layer(host, 'header-banner')).toBeNull();
  });

  it('sizes the background layer by scope', () => {
    const s = {
      ...DEFAULT_SETTINGS,
      backgroundImageEnabled: true,
      backgroundImageRef: 'asset://bg',
    };
    const assets = stubResolver({ 'asset://bg': 'blob:bg' });

    const full = layer(build(makeLayout(), s, assets).host, 'background')!;
    expect(full.style.inset).toBe('0px');
    expect(full.style.opacity).toBe('1');

    const scoped = layer(
      build(
        makeLayout(),
        { ...s, backgroundImageScope: 'content-only' },
        assets,
      ).host,
      'background',
    )!;
    expect(scoped.style.top).toBe('94.6px');
    expect(scoped.style.width).toBe('605px');
    expect(scoped.style.height).toBe('929.8px');
  });

  it('omits the background layer when disabled or unresolvable', () => {
    const enabled = {
      ...DEFAULT_SETTINGS,
      backgroundImageEnabled: true,
      backgroundImageRef: 'asset://bg',
    };
    expect(layer(build(makeLayout()).host, 'background')).toBeNull();
    expect(layer(build(makeLayout(), enabled).host, 'background')).toBeNull();
  });

  it('appends the frame overlay last, inset by frameMargin', () => {
    const s = { ...DEFAULT_SETTINGS, frameEnabled: true, frameMargin: 8 };
    const { host, sheets } = build(makeLayout(), s);
    const frame = boxOf(host).lastElementChild as HTMLElement;
    expect(frame.dataset.pmLayer).toBe('frame');
    expect(frame.style.top).toBe('8px');
    // The border itself comes from the shared .mpdf-page-frame rule.
    expect(frame.className).toBe('mpdf-page-frame');
    const cssText = sheets
      .flatMap((sheet) => Array.from(sheet.cssRules))
      .map((rule) => rule.cssText)
      .join('\n');
    expect(cssText).toContain('.mpdf-page-frame');
  });

  it('omits the frame when disabled', () => {
    const { host } = build(makeLayout());
    expect(layer(host, 'frame')).toBeNull();
  });
});
