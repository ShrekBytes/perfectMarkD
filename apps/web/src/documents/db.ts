// ─────────────────────────────────────────────────────────────────────────────
// IndexedDB persistence for the local document library, via the `idb`
// wrapper. Thin CRUD only — autosave, undo, and cross-tab sync live in
// store.ts on top of these primitives.
// ─────────────────────────────────────────────────────────────────────────────

import { openDB, type IDBPDatabase } from 'idb';
import type { AssetRecord, DocumentRecord } from './types';

const DB_NAME = 'perfectmarkd';
const DB_VERSION = 1;
const DOCS = 'documents';
const ASSETS = 'assets';

/** Opens (and on first use creates) the library database. */
export function openDatabase(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(DOCS)) {
        db.createObjectStore(DOCS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(ASSETS)) {
        db.createObjectStore(ASSETS, { keyPath: 'id' });
      }
    },
  });
}

export async function getDocument(
  db: IDBPDatabase,
  id: string,
): Promise<DocumentRecord | undefined> {
  return db.get(DOCS, id);
}

export async function listDocuments(
  db: IDBPDatabase,
): Promise<DocumentRecord[]> {
  const docs = await db.getAll(DOCS);
  return docs.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function putDocument(
  db: IDBPDatabase,
  doc: DocumentRecord,
): Promise<void> {
  return db.put(DOCS, doc).then(() => undefined);
}

export function deleteDocument(db: IDBPDatabase, id: string): Promise<void> {
  return db.delete(DOCS, id).then(() => undefined);
}

export function putAssets(
  db: IDBPDatabase,
  assets: AssetRecord[],
): Promise<void> {
  if (assets.length === 0) return Promise.resolve();
  const tx = db.transaction(ASSETS, 'readwrite');
  for (const asset of assets) void tx.store.put(asset);
  return tx.done.then(() => undefined);
}

export function getAsset(
  db: IDBPDatabase,
  id: string,
): Promise<AssetRecord | undefined> {
  return db.get(ASSETS, id);
}

export async function getAssets(
  db: IDBPDatabase,
  ids: readonly string[],
): Promise<AssetRecord[]> {
  const records = await Promise.all(ids.map((id) => db.get(ASSETS, id)));
  return records.filter((record) => record !== undefined);
}

export function deleteAssets(
  db: IDBPDatabase,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return Promise.resolve();
  const tx = db.transaction(ASSETS, 'readwrite');
  for (const id of ids) void tx.store.delete(id);
  return tx.done.then(() => undefined);
}
