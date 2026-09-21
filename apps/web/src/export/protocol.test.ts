// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '@perfectmarkd/core';
import {
  EXPORT_RENDER_MESSAGE,
  isExportRenderMessage,
  renderServerExportDocument,
  type ExportRenderPayload,
} from './protocol';

/** jsdom has no FontFace and no document.fonts; these record what the render
 *  registers. jsdom's Document accepts the fonts expando fine. */
const registeredFaces: string[] = [];
let failNextLoad: boolean;

beforeEach(() => {
  registeredFaces.length = 0;
  failNextLoad = false;
  const Face = vi.fn(function (this: unknown, family: string, source: string) {
    return {
      family,
      source,
      load: vi.fn(async () => {
        if (failNextLoad) throw new Error('bad font');
        registeredFaces.push(family);
      }),
    };
  });
  vi.stubGlobal('FontFace', Face);
  (document as unknown as { fonts: unknown }).fonts = {
    add: vi.fn(),
    delete: vi.fn(),
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (document as unknown as { fonts?: unknown }).fonts;
  // Each render paints over the document; restore a blank one.
  document.documentElement.replaceChildren(
    document.createElement('head'),
    document.createElement('body'),
  );
});

function payload(
  overrides: Partial<ExportRenderPayload> = {},
): ExportRenderPayload {
  return {
    title: 'Test Doc',
    markdown: '# Heading One\n\nSome text.',
    settings: { ...DEFAULT_SETTINGS },
    assets: {},
    fonts: [],
    ...overrides,
  };
}

describe('isExportRenderMessage', () => {
  it('accepts only the agreed message shape', () => {
    expect(
      isExportRenderMessage({
        type: EXPORT_RENDER_MESSAGE,
        payload: payload(),
      }),
    ).toBe(true);
    expect(isExportRenderMessage({ type: 'other', payload: payload() })).toBe(
      false,
    );
    expect(isExportRenderMessage({ type: EXPORT_RENDER_MESSAGE })).toBe(false);
    expect(isExportRenderMessage('hello')).toBe(false);
  });
});

describe('renderServerExportDocument', () => {
  it('paints the export document and reports outline + page count', async () => {
    const result = await renderServerExportDocument(payload(), { mathCSS: '' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // jsdom's zero-height measurement gives one page per section (see
    // pipeline.ts) — the structural contract is what matters here; real
    // pagination behavior is the engine's golden suite.
    expect(result.pageCount).toBe(1);
    expect(result.outline).toEqual([
      { title: 'Heading One', level: 1, page: 1 },
    ]);
    // The export document replaced the app document (Page.pdf prints the
    // main frame) and carries the title.
    expect(document.querySelector('.mpdf-export-page')).toBeTruthy();
    expect(document.title).toBe('Test Doc');
  });

  it('swaps asset refs to the provided data URIs and drops unresolvable ones', async () => {
    const result = await renderServerExportDocument(
      payload({
        markdown: '![known](asset://known)\n\n![unknown](asset://missing)\n',
        assets: { 'asset://known': 'data:image/png;base64,AAA' },
      }),
      { mathCSS: '' },
    );
    expect(result.ok).toBe(true);
    const imgs = Array.from(document.querySelectorAll('img'));
    expect(imgs).toHaveLength(1);
    expect(imgs[0]?.getAttribute('src')).toBe('data:image/png;base64,AAA');
  });

  it('reports a typed failure instead of throwing', async () => {
    const result = await renderServerExportDocument(
      payload({ markdown: null as unknown as string }),
      { mathCSS: '' },
    );
    expect(result).toMatchObject({ ok: false, errorCode: 'render_failed' });
  });

  it('registers payload fonts before paginating and embeds them as @font-face (billing/05)', async () => {
    const result = await renderServerExportDocument(
      payload({
        settings: {
          ...DEFAULT_SETTINGS,
          fontFamily: '__custom__',
          customFontName: 'Inter',
        },
        fonts: [
          {
            family: 'Inter',
            url: 'data:font/woff2;base64,AAA',
            format: 'woff2',
          },
        ],
      }),
      { mathCSS: '' },
    );
    expect(result.ok).toBe(true);
    // Registered before pagination (metrics), then embedded in the painted
    // document (print).
    expect(registeredFaces).toEqual(['Inter']);
    const css = document.querySelector('style')?.textContent ?? '';
    expect(css).toContain('@font-face { font-family: "Inter"');
    // The payload's format hint survives to the embedded rule — the same
    // @font-face shape the Client Export embeds.
    expect(css).toContain('format("woff2")');
  });

  it('survives a corrupt payload font and embeds nothing', async () => {
    failNextLoad = true;
    const result = await renderServerExportDocument(
      payload({ fonts: [{ family: 'Bad', url: 'data:font/ttf;base64,AAA' }] }),
      { mathCSS: '' },
    );
    expect(result.ok).toBe(true);
    expect(registeredFaces).toEqual([]);
    expect(document.querySelector('style')?.textContent).not.toContain(
      '@font-face',
    );
  });
});
