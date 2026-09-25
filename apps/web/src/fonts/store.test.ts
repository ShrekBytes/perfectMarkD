// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubIndexedDB } from '../testing/stub-idb';
import { closeAfterSettle } from '../testing/test-assets';
import { openDatabase, putFont } from '../documents/db';
import type { FontRecord } from '../documents/types';
import { useCustomFontStore } from './store';

let loadVerdict: 'loaded' | 'invalid' | 'unavailable';
let registeredFamilies: string[];
let unregisteredFamilies: string[];

vi.mock('./loader', () => ({
  registerCustomFont: vi.fn(async (record: { family: string }) => {
    if (loadVerdict === 'invalid') return 'invalid';
    registeredFamilies.push(record.family);
    return loadVerdict;
  }),
  unregisterCustomFont: vi.fn((family: string) => {
    unregisteredFamilies.push(family);
  }),
  // The export helpers live in loader.ts but touch no store state here.
  ensureCustomFontsLoaded: vi.fn(async () => undefined),
  isFontFamilyLoaded: vi.fn(() => false),
}));

const woff2 = (name = 'Inter.woff2'): File =>
  new File([new Uint8Array(8)], name, { type: '' });

function resetStore(fonts: FontRecord[] = []): void {
  useCustomFontStore.setState({ fonts, loaded: true });
}

beforeEach(() => {
  stubIndexedDB();
  loadVerdict = 'loaded';
  registeredFamilies = [];
  unregisteredFamilies = [];
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('useCustomFontStore', () => {
  it('loads the persisted library, sorted by family', async () => {
    const db = await openDatabase();
    await putFont(db, {
      id: 'b',
      family: 'Zig',
      bytes: new Uint8Array(1),
      mediaType: 'font/ttf',
      createdAt: 1,
    });
    await putFont(db, {
      id: 'a',
      family: 'Ada',
      bytes: new Uint8Array(1),
      mediaType: 'font/ttf',
      createdAt: 2,
    });
    await closeAfterSettle(db);

    await useCustomFontStore.getState().load();
    expect(useCustomFontStore.getState().loaded).toBe(true);
    expect(useCustomFontStore.getState().fonts.map((f) => f.family)).toEqual([
      'Ada',
      'Zig',
    ]);
  });

  it('stores a valid upload under its derived family', async () => {
    resetStore();
    const result = await useCustomFontStore.getState().add(woff2());
    expect(result).toEqual({ ok: true, family: 'Inter' });
    expect(registeredFamilies).toEqual(['Inter']);
    expect(useCustomFontStore.getState().fonts.map((f) => f.family)).toEqual([
      'Inter',
    ]);
    // The bytes persisted too.
    const db = await openDatabase();
    expect(await db.getAll('fonts')).toHaveLength(1);
    await closeAfterSettle(db);
  });

  it('refuses a file the FontFace parse rejects — nothing stored', async () => {
    resetStore();
    loadVerdict = 'invalid';
    const result = await useCustomFontStore.getState().add(woff2('fake.ttf'));
    expect(result).toEqual({ ok: false, error: 'invalid' });
    expect(useCustomFontStore.getState().fonts).toEqual([]);
    expect(registeredFamilies).toEqual([]);
  });

  it('replaces an upload with the same family name instead of stacking faces', async () => {
    resetStore();
    await useCustomFontStore.getState().add(woff2('Inter.woff2'));
    await useCustomFontStore.getState().add(woff2('Inter.ttf'));
    expect(useCustomFontStore.getState().fonts).toHaveLength(1);
    // Only the second upload replaced a face; the first had no ancestor.
    expect(unregisteredFamilies).toEqual(['Inter']);
    const db = await openDatabase();
    expect(await db.getAll('fonts')).toHaveLength(1);
    await closeAfterSettle(db);
  });

  it('passes ingest refusals through (size, format)', async () => {
    resetStore();
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.woff2');
    expect(await useCustomFontStore.getState().add(big)).toEqual({
      ok: false,
      error: 'too-large',
    });
    expect(
      await useCustomFontStore
        .getState()
        .add(new File([new Uint8Array(1)], 'x.png')),
    ).toEqual({ ok: false, error: 'unsupported' });
  });

  it('remove drops the record and unregisters the face', async () => {
    resetStore([
      {
        id: 'f1',
        family: 'Inter',
        bytes: new Uint8Array(1),
        mediaType: 'font/ttf',
        createdAt: 1,
      },
    ]);
    await useCustomFontStore.getState().remove('f1');
    expect(useCustomFontStore.getState().fonts).toEqual([]);
    expect(unregisteredFamilies).toEqual(['Inter']);
    const db = await openDatabase();
    expect(await db.getAll('fonts')).toHaveLength(0);
    await closeAfterSettle(db);
  });
});
