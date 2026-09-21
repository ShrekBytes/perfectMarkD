// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  FONT_ACCEPT,
  MAX_FONT_BYTES,
  familyForFile,
  fontFormatFor,
  prepareFont,
} from './ingest';

const fontFile = (name: string, size = 8, type = ''): File =>
  new File([new Uint8Array(size)], name, { type });

describe('familyForFile', () => {
  it('uses the file stem as the CSS family name', () => {
    expect(familyForFile('Inter-Regular.woff2')).toBe('Inter-Regular');
  });

  it('collapses whitespace and strips quotes and backslashes', () => {
    expect(familyForFile('  My   "Weird"\\Font .ttf')).toBe('My WeirdFont');
  });

  it('caps runaway file names and never returns an empty family', () => {
    expect(familyForFile('x'.repeat(200) + '.otf').length).toBeLessThanOrEqual(
      64,
    );
    expect(familyForFile('"".woff2')).toBe('Custom font');
  });
});

describe('fontFormatFor', () => {
  it('maps the stored media types to CSS format hints', () => {
    expect(fontFormatFor('font/ttf')).toBe('truetype');
    expect(fontFormatFor('font/otf')).toBe('opentype');
    expect(fontFormatFor('font/woff')).toBe('woff');
    expect(fontFormatFor('font/woff2')).toBe('woff2');
    expect(fontFormatFor('application/octet-stream')).toBeUndefined();
  });
});

describe('prepareFont', () => {
  it('accepts the four shipped font formats, extension-decided', async () => {
    // Browsers rarely tag font downloads; the extension is authoritative.
    for (const name of ['a.ttf', 'b.otf', 'c.woff', 'd.woff2']) {
      expect((await prepareFont(fontFile(name, 8))).ok).toBe(true);
    }
    expect((await prepareFont(fontFile('a.woff2', 8, 'font/woff2'))).ok).toBe(
      true,
    );
  });

  it('accepts extensions case-insensitively and derives the family', async () => {
    expect(await prepareFont(fontFile('My Font.TTF'))).toEqual({
      ok: true,
      font: {
        bytes: expect.any(Uint8Array),
        mediaType: 'font/ttf',
        family: 'My Font',
      },
    });
  });

  it('refuses files over the 10 MB cap before reading them', async () => {
    expect(
      await prepareFont(fontFile('huge.woff2', MAX_FONT_BYTES + 1)),
    ).toEqual({ ok: false, error: 'too-large' });
    expect((await prepareFont(fontFile('edge.woff2', MAX_FONT_BYTES))).ok).toBe(
      true,
    );
  });

  it('rejects non-font files', async () => {
    expect(await prepareFont(fontFile('photo.png'))).toEqual({
      ok: false,
      error: 'unsupported',
    });
    expect(await prepareFont(fontFile('noextension'))).toEqual({
      ok: false,
      error: 'unsupported',
    });
  });

  it("offers the picker's accept string", () => {
    expect(FONT_ACCEPT).toBe('.ttf,.otf,.woff,.woff2');
  });
});
