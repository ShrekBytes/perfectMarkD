import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@perfectmarkd/core';
import { parseExportPayload } from './payload.js';

const PAGE_CAP = 10;

function basePayload(overrides: Record<string, unknown> = {}) {
  return { markdown: '# Hello\n\nWorld', pageCount: 1, ...overrides };
}

describe('parseExportPayload', () => {
  it('accepts a minimal payload and defaults the title', () => {
    const parsed = parseExportPayload(basePayload(), PAGE_CAP);
    expect(parsed).toMatchObject({
      ok: true,
      payload: {
        title: 'Untitled',
        markdown: '# Hello\n\nWorld',
        pageCount: 1,
        assets: {},
      },
    });
    if (parsed.ok) {
      // Settings fall back to the engine defaults, repaired like the editor
      // would before persist.
      expect(parsed.payload.settings.fontSize).toBe(DEFAULT_SETTINGS.fontSize);
    }
  });

  it('trims the title and caps its length', () => {
    const parsed = parseExportPayload(
      basePayload({ title: `  ${'x'.repeat(300)}  ` }),
      PAGE_CAP,
    );
    expect(parsed.ok && parsed.payload.title.length).toBe(200);
  });

  it('repairs out-of-range settings the same way the editor does', () => {
    const parsed = parseExportPayload(
      basePayload({
        settings: { ...DEFAULT_SETTINGS, fontSize: -5, preset: 'nope' },
      }),
      PAGE_CAP,
    );
    if (!parsed.ok) throw new Error('expected ok');
    expect(parsed.payload.settings.fontSize).toBe(1);
    expect(parsed.payload.settings.preset).toBe('default');
  });

  it('rejects non-objects and missing markdown', () => {
    expect(parseExportPayload(null, PAGE_CAP).ok).toBe(false);
    expect(parseExportPayload('nope', PAGE_CAP).ok).toBe(false);
    expect(parseExportPayload(basePayload({ markdown: '' }), PAGE_CAP).ok).toBe(
      false,
    );
    expect(
      parseExportPayload(basePayload({ markdown: '   ' }), PAGE_CAP).ok,
    ).toBe(false);
  });

  it('rejects a bad page count and one over the plan cap', () => {
    expect(parseExportPayload(basePayload({ pageCount: 0 }), PAGE_CAP).ok).toBe(
      false,
    );
    expect(
      parseExportPayload(basePayload({ pageCount: 1.5 }), PAGE_CAP).ok,
    ).toBe(false);
    const over = parseExportPayload(basePayload({ pageCount: 11 }), PAGE_CAP);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error).toContain('up to 10');
  });

  it('rejects assets that are not data: URIs or exceed the count cap', () => {
    expect(
      parseExportPayload(
        basePayload({ assets: { 'asset://a': 'https://x' } }),
        PAGE_CAP,
      ).ok,
    ).toBe(false);
    const tooMany = Object.fromEntries(
      Array.from({ length: 201 }, (_, i) => [
        `asset://${i}`,
        'data:image/png;base64,x',
      ]),
    );
    expect(
      parseExportPayload(basePayload({ assets: tooMany }), PAGE_CAP).ok,
    ).toBe(false);
    expect(
      parseExportPayload(
        basePayload({ assets: { 'asset://a': 'data:image/png;base64,x' } }),
        PAGE_CAP,
      ).ok,
    ).toBe(true);
  });

  it('accepts custom fonts as data: URIs and rejects anything else (billing/05)', () => {
    const parsed = parseExportPayload(
      basePayload({ fonts: { Inter: 'data:font/woff2;base64,x' } }),
      PAGE_CAP,
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.payload.fonts).toEqual({
        Inter: 'data:font/woff2;base64,x',
      });
    }

    expect(
      parseExportPayload(
        basePayload({ fonts: { Inter: 'https://evil.example/inter.woff2' } }),
        PAGE_CAP,
      ).ok,
    ).toBe(false);
    expect(
      parseExportPayload(basePayload({ fonts: 'nope' }), PAGE_CAP).ok,
    ).toBe(false);
    const tooMany = Object.fromEntries(
      Array.from({ length: 51 }, (_, i) => [
        `Font${i}`,
        'data:font/ttf;base64,x',
      ]),
    );
    expect(
      parseExportPayload(basePayload({ fonts: tooMany }), PAGE_CAP).ok,
    ).toBe(false);
  });

  it('defaults missing fonts to an empty map', () => {
    const parsed = parseExportPayload(basePayload(), PAGE_CAP);
    expect(parsed.ok && parsed.payload.fonts).toEqual({});
  });
});
