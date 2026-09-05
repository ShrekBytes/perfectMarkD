import { DEFAULT_SETTINGS } from '@perfectmarkd/core';
import type { IDBPDatabase } from 'idb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  deleteAssets,
  deleteDocument,
  getAsset,
  getAssets,
  getDocument,
  listDocuments,
  openDatabase,
  putAssets,
  putDocument,
} from './db';
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
  const blob = new Blob(['png-bytes'], { type: 'image/png' });
  const asset: AssetRecord = { id: 'asset-1', blob, createdAt: 1000 };
  await putAssets(db, [asset]);

  expect((await getAsset(db, 'asset-1'))?.blob).toEqual(blob);
  expect(await getAssets(db, ['asset-1', 'missing'])).toEqual([asset]);
});

it('deletes assets by id', async () => {
  await putAssets(db, [
    { id: 'asset-1', blob: new Blob(['a']), createdAt: 1000 },
    { id: 'asset-2', blob: new Blob(['b']), createdAt: 1000 },
  ]);
  await deleteAssets(db, ['asset-1']);

  expect(await getAsset(db, 'asset-1')).toBeUndefined();
  expect(await getAsset(db, 'asset-2')).toBeDefined();
});
