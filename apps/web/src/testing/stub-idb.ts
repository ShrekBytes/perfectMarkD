import {
  IDBCursor,
  IDBDatabase,
  IDBFactory,
  IDBIndex,
  IDBKeyRange,
  IDBObjectStore,
  IDBRequest,
  IDBTransaction,
  IDBVersionChangeEvent,
} from 'fake-indexeddb';
import { vi } from 'vitest';

/**
 * Replaces the global IndexedDB with a fresh fake factory (empty databases)
 * plus the IDB globals the `idb` wrapper references. Returns the factory so
 * tests can reopen databases across it (simulating reloads / extra tabs).
 */
export function stubIndexedDB(): IDBFactory {
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('IDBRequest', IDBRequest);
  vi.stubGlobal('IDBOpenDBRequest', IDBRequest);
  vi.stubGlobal('IDBDatabase', IDBDatabase);
  vi.stubGlobal('IDBObjectStore', IDBObjectStore);
  vi.stubGlobal('IDBIndex', IDBIndex);
  vi.stubGlobal('IDBTransaction', IDBTransaction);
  vi.stubGlobal('IDBCursor', IDBCursor);
  vi.stubGlobal('IDBVersionChangeEvent', IDBVersionChangeEvent);
  return indexedDB as IDBFactory;
}
