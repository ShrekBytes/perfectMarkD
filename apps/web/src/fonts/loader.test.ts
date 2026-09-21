// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type DocumentSettings } from '@perfectmarkd/core';
import { openDatabase } from '../documents/db';
import type { FontRecord } from '../documents/types';
import { stubIndexedDB } from '../testing/stub-idb';
import { closeAfterSettle } from '../testing/test-assets';
import {
  ensureCustomFontsLoaded,
  fontFaceCSSForExport,
  fontFacesForExport,
  fontToDataUri,
  isFontFamilyLoaded,
  registerCustomFont,
  registerPayloadFonts,
  unregisterCustomFont,
} from './loader';

// ─── FontFace stub ────────────────────────────────────────────────────────────
// jsdom has no FontFace and no document.fonts; these stand-ins record the
// calls the loader makes so tests can assert registration semantics.

interface StubFace {
  family: string;
  source: string | ArrayBuffer;
  load: ReturnType<typeof vi.fn>;
}

let stubFaces: StubFace[];
let registry: Set<StubFace>;
/** When set, face.load() rejects — a corrupt font file. */
let failNextLoad: boolean;

function stubFontFace(): void {
  stubFaces = [];
  registry = new Set();
  failNextLoad = false;
  const Face = vi.fn(function (this: unknown, family: string, source: string | ArrayBuffer) {
    const face: StubFace = {
      family,
      source,
      load: vi.fn(async () => {
        if (failNextLoad) throw new Error('bad font');
        registry.add(face);
      }),
    };
    stubFaces.push(face);
    return face;
  });
  vi.stubGlobal('FontFace', Face);
  vi.stubGlobal('document', {
    ...(typeof document === 'object' ? document : {}),
    fonts: {
      add: vi.fn((face: StubFace) => registry.has(face)),
      delete: vi.fn((face: StubFace) => registry.delete(face)),
    },
  });
}

function fontRecord(overrides: Partial<FontRecord> = {}): FontRecord {
  return {
    id: overrides.id ?? 'f1',
    family: overrides.family ?? 'Inter',
    bytes: overrides.bytes ?? new Uint8Array([1, 2, 3]),
    mediaType: overrides.mediaType ?? 'font/woff2',
    createdAt: overrides.createdAt ?? 1,
  };
}

const customBody = (family: string): Partial<DocumentSettings> => ({
  fontFamily: '__custom__',
  customFontName: family,
});

beforeEach(() => {
  stubIndexedDB();
  stubFontFace();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('registerCustomFont', () => {
  it('loads the bytes into a FontFace and adds it to document.fonts', async () => {
    const record = fontRecord();
    const verdict = await registerCustomFont(record);
    expect(verdict).toBe('loaded');
    expect(stubFaces[0]!.family).toBe('Inter');
    expect(stubFaces[0]!.load).toHaveBeenCalledOnce();
    expect(registry.has(stubFaces[0]!)).toBe(true);
  });

  it('reports invalid fonts without registering them', async () => {
    failNextLoad = true;
    expect(await registerCustomFont(fontRecord())).toBe('invalid');
    expect(registry.size).toBe(0);
  });

  it('reports the API as unavailable where FontFace is missing', async () => {
    vi.unstubAllGlobals();
    stubIndexedDB(); // keep the IDB globals, drop the FontFace stub
    expect(await registerCustomFont(fontRecord())).toBe('unavailable');
  });
});

describe('unregisterCustomFont', () => {
  it('removes the face again', async () => {
    await registerCustomFont(fontRecord());
    unregisterCustomFont('Inter');
    expect(registry.size).toBe(0);
  });

  it('tolerates an unknown family', () => {
    expect(() => unregisterCustomFont('Ghost')).not.toThrow();
  });
});

describe('ensureCustomFontsLoaded', () => {
  it('loads the families the settings put to use from the font store', async () => {
    const db = await openDatabase();
    const { putFont } = await import('../documents/db');
    await putFont(db, fontRecord({ family: 'Inter' }));
    await closeAfterSettle(db);

    await ensureCustomFontsLoaded({
      ...DEFAULT_SETTINGS,
      ...customBody('Inter'),
    } as DocumentSettings);
    expect(isFontFamilyLoaded('Inter')).toBe(true);
    expect(isFontFamilyLoaded('Fira Code')).toBe(false);
  });

  it('is a no-op when no custom family is in use', async () => {
    await ensureCustomFontsLoaded(DEFAULT_SETTINGS);
    expect(stubFaces).toHaveLength(0);
  });

  it('survives a family the store does not know (deleted font)', async () => {
    await expect(
      ensureCustomFontsLoaded({
        ...DEFAULT_SETTINGS,
        ...customBody('Ghost'),
      } as DocumentSettings),
    ).resolves.toBeUndefined();
    expect(isFontFamilyLoaded('Ghost')).toBe(false);
  });

  it('loads the code font too, once per family', async () => {
    const db = await openDatabase();
    const { putFont } = await import('../documents/db');
    await putFont(db, fontRecord({ family: 'Fira Code' }));
    await closeAfterSettle(db);

    const settings = {
      ...DEFAULT_SETTINGS,
      ...customBody('Fira Code'),
      codeFontFamily: '__custom__',
      customCodeFontName: 'Fira Code',
    } as DocumentSettings;
    await ensureCustomFontsLoaded(settings);
    await ensureCustomFontsLoaded(settings);
    expect(stubFaces).toHaveLength(1);
  });
});

describe('fontToDataUri', () => {
  it('encodes the bytes as a data URI of the font media type', async () => {
    const uri = await fontToDataUri(fontRecord({ mediaType: 'font/ttf' }));
    expect(uri).toBe('data:font/ttf;base64,AQID');
  });
});

describe('fontFacesForExport / fontFaceCSSForExport', () => {
  it('resolves the settings families to data-URI faces, format hints included', async () => {
    const db = await openDatabase();
    const { putFont } = await import('../documents/db');
    await putFont(db, fontRecord({ family: 'Inter', mediaType: 'font/woff2' }));
    await closeAfterSettle(db);

    const faces = await fontFacesForExport({
      ...DEFAULT_SETTINGS,
      ...customBody('Inter'),
    } as DocumentSettings);
    expect(faces).toEqual([
      { family: 'Inter', url: 'data:font/woff2;base64,AQID', format: 'woff2' },
    ]);
    expect(
      await fontFaceCSSForExport({
        ...DEFAULT_SETTINGS,
        ...customBody('Inter'),
      } as DocumentSettings),
    ).toContain('font-family: "Inter"');
  });

  it('skips families the store cannot resolve', async () => {
    const faces = await fontFacesForExport({
      ...DEFAULT_SETTINGS,
      ...customBody('Ghost'),
    } as DocumentSettings);
    expect(faces).toEqual([]);
  });

  it('is empty without custom families', async () => {
    expect(await fontFacesForExport(DEFAULT_SETTINGS)).toEqual([]);
  });
});

describe('registerPayloadFonts', () => {
  it('registers each payload font for rendering', async () => {
    await registerPayloadFonts({ Inter: 'data:font/woff2;base64,AQID' });
    expect(isFontFamilyLoaded('Inter')).toBe(true);
    // The data URI arrives wrapped in the CSS src form FontFace requires.
    expect(stubFaces[0]!.source).toBe('url("data:font/woff2;base64,AQID")');
  });

  it('replaces the previous payload faces so same-named families cannot go stale', async () => {
    await registerPayloadFonts({ Stale: 'data:font/woff2;base64,AQID' });
    await registerPayloadFonts({ Fira: 'data:font/ttf;base64,BAU=' });
    expect(isFontFamilyLoaded('Stale')).toBe(false);
    expect(isFontFamilyLoaded('Fira')).toBe(true);
    expect(registry.size).toBe(1);
  });

  it('keeps rendering when a payload font is corrupt', async () => {
    failNextLoad = true;
    expect(
      await registerPayloadFonts({ Bad: 'data:font/ttf;base64,AQID' }),
    ).toEqual([]);
    expect(isFontFamilyLoaded('Bad')).toBe(false);
  });

  it('is a no-op where FontFace is missing', async () => {
    vi.unstubAllGlobals();
    stubIndexedDB();
    expect(
      await registerPayloadFonts({ Inter: 'data:font/ttf;base64,AQID' }),
    ).toEqual([]);
  });
});
