// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@perfectmarkd/core';
import {
  EXPORT_RENDER_MESSAGE,
  isExportRenderMessage,
  renderServerExportDocument,
  type ExportRenderPayload,
} from './protocol';

afterEach(() => {
  // Each render paints over the document; restore a blank one.
  document.documentElement.replaceChildren(
    document.createElement('head'),
    document.createElement('body'),
  );
});

function payload(overrides: Partial<ExportRenderPayload> = {}): ExportRenderPayload {
  return {
    title: 'Test Doc',
    markdown: '# Heading One\n\nSome text.',
    settings: { ...DEFAULT_SETTINGS },
    assets: {},
    ...overrides,
  };
}

describe('isExportRenderMessage', () => {
  it('accepts only the agreed message shape', () => {
    expect(
      isExportRenderMessage({ type: EXPORT_RENDER_MESSAGE, payload: payload() }),
    ).toBe(true);
    expect(isExportRenderMessage({ type: 'other', payload: payload() })).toBe(false);
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
        markdown:
          '![known](asset://known)\n\n![unknown](asset://missing)\n',
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
});
