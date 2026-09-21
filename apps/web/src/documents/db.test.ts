import { DEFAULT_SETTINGS } from '@perfectmarkd/core';
import type { IDBPDatabase } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  deleteAssets,
  deleteDocument,
  deleteFont,
  getAsset,
  getAssets,
  getDocument,
  getMeta,
  listDocuments,
  listFonts,
  openDatabase,
  putAssets,
  putDocument,
  putFont,
  putMeta,
} from './db';
import { closeAfterSettle } from '../testing/test-assets';
import type { AssetRecord, DocumentRecord } from './types';
import { stubIndexedDB } from '../testing/stub-idb';

function makeDoc(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: 'doc-1',
    name: 'Notes',
    markdown: '# Hello',
    settings: { ...DEFAULT_SETTINGS },
    assetIds: [],
    createdAt: 1000,
    updatedAt: 1000,
    pageCount: null,
    ...overrides,
  };
}

let db: IDBPDatabase;

beforeEach(async () => {
  stubIndexedDB();
  db = await openDatabase();
});

afterEach(async () => {
  db.close();
  vi.unstubAllGlobals();
});

it('round-trips a document record', async () => {
  const doc = makeDoc({
    settings: { ...DEFAULT_SETTINGS, pageSize: 'Letter' },
  });
  await putDocument(db, doc);

  expect(await getDocument(db, 'doc-1')).toEqual(doc);
});

it('returns undefined for a missing document', async () => {
  expect(await getDocument(db, 'nope')).toBeUndefined();
});

it('overwrites a document on re-put', async () => {
  await putDocument(db, makeDoc({ markdown: 'v1' }));
  await putDocument(db, makeDoc({ markdown: 'v2' }));

  expect(await getDocument(db, 'doc-1')).toMatchObject({ markdown: 'v2' });
});

it('lists documents sorted by most recent update first', async () => {
  await putDocument(db, makeDoc({ id: 'a', updatedAt: 100 }));
  await putDocument(db, makeDoc({ id: 'b', updatedAt: 300 }));
  await putDocument(db, makeDoc({ id: 'c', updatedAt: 200 }));

  const ids = (await listDocuments(db)).map((d) => d.id);
  expect(ids).toEqual(['b', 'c', 'a']);
});

it('deletes a document', async () => {
  await putDocument(db, makeDoc());
  await deleteDocument(db, 'doc-1');

  expect(await getDocument(db, 'doc-1')).toBeUndefined();
});

it('round-trips assets and reads several at once', async () => {
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const asset: AssetRecord = {
    id: 'asset-1',
    bytes,
    mediaType: 'image/png',
    createdAt: 1000,
  };
  await putAssets(db, [asset]);

  expect((await getAsset(db, 'asset-1'))?.bytes).toEqual(bytes);
  expect(await getAssets(db, ['asset-1', 'missing'])).toEqual([asset]);
});

it('deletes assets by id', async () => {
  await putAssets(db, [
    {
      id: 'asset-1',
      bytes: new Uint8Array([1]),
      mediaType: 'image/png',
      createdAt: 1000,
    },
    {
      id: 'asset-2',
      bytes: new Uint8Array([2]),
      mediaType: 'image/png',
      createdAt: 1000,
    },
  ]);
  await deleteAssets(db, ['asset-1']);

  expect(await getAsset(db, 'asset-1')).toBeUndefined();
  expect(await getAsset(db, 'asset-2')).toBeDefined();
});

it('round-trips meta values under their key', async () => {
  expect(await getMeta(db, 'onboarding')).toBeUndefined();

  await putMeta(db, 'onboarding', { sampleDocId: 'doc-1', dismissed: false });
  expect(await getMeta(db, 'onboarding')).toEqual({
    sampleDocId: 'doc-1',
    dismissed: false,
  });

  await putMeta(db, 'onboarding', { sampleDocId: 'doc-1', dismissed: true });
  expect(await getMeta(db, 'onboarding')).toEqual({
    sampleDocId: 'doc-1',
    dismissed: true,
  });
});

it('keeps meta keys independent', async () => {
  await putMeta(db, 'a', 1);
  await putMeta(db, 'b', 2);

  expect(await getMeta(db, 'a')).toBe(1);
  expect(await getMeta(db, 'b')).toBe(2);
});

it('upgrades a pre-fonts (version 2) database in place, keeping its data', async () => {
  db.close();
  // A fresh factory, then a library as version 2 wrote it: three stores, no
  // fonts, and one document row the upgrade must keep.
  stubIndexedDB();
  const legacy = indexedDB.open('perfectmarkd', 2);
  legacy.onupgradeneeded = () => {
    legacy.result.createObjectStore('documents', { keyPath: 'id' });
    legacy.result.createObjectStore('assets', { keyPath: 'id' });
    legacy.result.createObjectStore('meta');
  };
  await new Promise((resolve, reject) => {
    legacy.onsuccess = () => resolve(null);
    legacy.onerror = () => reject(legacy.error);
  });
  const legacyTx = legacy.result
    .transaction('documents', 'readwrite')
    .objectStore('documents')
    .put(makeDoc({ name: 'Legacy' }));
  await new Promise((resolve, reject) => {
    legacyTx.onsuccess = () => resolve(null);
    legacyTx.onerror = () => reject(legacyTx.error);
  });
  legacy.result.close();

  const upgraded = await openDatabase();
  expect(upgraded.version).toBe(3);
  expect(upgraded.objectStoreNames.contains('fonts')).toBe(true);
  await putFont(upgraded, {
    id: 'f1',
    family: 'Inter',
    bytes: new Uint8Array(1),
    mediaType: 'font/woff2',
    createdAt: 1,
  });
  expect(await listFonts(upgraded)).toHaveLength(1);
  expect((await getDocument(upgraded, 'doc-1'))?.name).toBe('Legacy');
  await closeAfterSettle(upgraded);
});

it('round-trips a font record (billing/05)', async () => {
  await putFont(db, {
    id: 'f1',
    family: 'Inter',
    bytes: new Uint8Array([1, 2]),
    mediaType: 'font/woff2',
    createdAt: 5,
  });
  expect((await listFonts(db))[0]).toMatchObject({ id: 'f1', family: 'Inter' });
  await deleteFont(db, 'f1');
  expect(await listFonts(db)).toEqual([]);
});
