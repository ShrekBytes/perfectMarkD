// @vitest-environment jsdom
import { DEFAULT_SETTINGS } from '@perfectmarkd/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbApi from './db';
import { AUTOSAVE_DELAY_MS, createDocumentStore } from './store';
import type { DocumentRecord } from './types';
import { stubBroadcastChannel } from '../testing/stub-broadcast-channel';
import { stubIndexedDB } from '../testing/stub-idb';

/**
 * Each test gets a fresh fake IndexedDB and BroadcastChannel registry. Stores
 * are created per test via createDocumentStore(), so "another tab" is simply
 * a second store instance over the same globals. Fake timers are restricted
 * to setTimeout + Date so fake-indexeddb's (native) microtasks still resolve.
 */

const T0 = Date.UTC(2026, 8, 4, 12, 0, 0);

type Store = ReturnType<typeof createDocumentStore>['useStore'];

interface ReadyStore {
  store: Store;
  id: string;
  /** Simulates a reload: closes connections and resets in-memory state. */
  reset: () => void;
}

async function readyStore(): Promise<ReadyStore> {
  const api = createDocumentStore();
  await api.useStore.getState().init();
  expect(api.useStore.getState().status).toBe('ready');
  return {
    store: api.useStore,
    id: api.useStore.getState().activeId!,
    reset: api.resetForTests,
  };
}

/** Replaces the seeded record in storage with the given asset ids. */
async function withAssetIds(id: string, assetIds: string[]): Promise<void> {
  const reader = await dbApi.openDatabase();
  await dbApi.putAssets(reader, [
    { id: 'asset-1', blob: new Blob(['png']), createdAt: T0 },
  ]);
  await dbApi.putDocument(reader, {
    ...(await dbApi.getDocument(reader, id))!,
    assetIds,
  });
  reader.close();
}

beforeEach(() => {
  stubIndexedDB();
  stubBroadcastChannel().reset();
  localStorage.clear();
  vi.useFakeTimers({ now: T0, toFake: ['setTimeout', 'clearTimeout', 'Date'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('init', () => {
  it('seeds one blank document on first run', async () => {
    const { store, id } = await readyStore();

    expect(store.getState().docs).toEqual([
      { id, name: 'Untitled document', updatedAt: T0 },
    ]);
    expect(store.getState().activeId).toBe(id);
    expect(store.getState().markdown).toBe('');
  });

  it('restores documents, the active document, and content on reload', async () => {
    const first = await readyStore();
    first.store.getState().updateActive({ markdown: '# Saved words' });
    await first.store.getState().flush();
    first.reset();

    const { store } = await readyStore();
    expect(store.getState().activeId).toBe(first.id);
    expect(store.getState().markdown).toBe('# Saved words');
    expect(store.getState().docs).toHaveLength(1);
  });

  it('falls back to the most recent document when the stored pointer is stale', async () => {
    const first = await readyStore();
    await first.store.getState().createDocument();
    localStorage.setItem('perfectmarkd:activeDoc', 'deleted-id');
    first.reset();

    const { store } = await readyStore();
    expect(store.getState().activeId).not.toBe('deleted-id');
    expect(store.getState().docs.map((row) => row.name)).toContain(
      'Untitled document',
    );
  });
});

describe('editing and autosave', () => {
  it('debounces edits and persists them after the delay', async () => {
    const { store, id } = await readyStore();

    store.getState().updateActive({ markdown: '# Hello' });
    expect(store.getState().saveState).toBe('saving');

    const reader = await dbApi.openDatabase();
    expect((await dbApi.getDocument(reader, id))?.markdown).toBe('');

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect((await dbApi.getDocument(reader, id))?.markdown).toBe('# Hello');
    expect(store.getState().saveState).toBe('saved');
    reader.close();
  });

  it('coalesces rapid edits into the final content', async () => {
    const { store, id } = await readyStore();

    store.getState().updateActive({ markdown: 'one' });
    await vi.advanceTimersByTimeAsync(200);
    store.getState().updateActive({ markdown: 'one two' });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    const reader = await dbApi.openDatabase();
    expect((await dbApi.getDocument(reader, id))?.markdown).toBe('one two');
    reader.close();
  });

  it('flushes pending edits immediately', async () => {
    const { store, id } = await readyStore();

    store.getState().updateActive({ markdown: 'flushed' });
    await store.getState().flush();

    const reader = await dbApi.openDatabase();
    expect((await dbApi.getDocument(reader, id))?.markdown).toBe('flushed');
    expect(store.getState().saveState).toBe('saved');
    reader.close();
  });

  it('persists a settings snapshot round-trip', async () => {
    const { store, id, reset } = await readyStore();

    store
      .getState()
      .updateActive({ settings: { pageSize: 'Legal', showFooter: false } });
    await store.getState().flush();
    reset();

    const { store: reloaded } = await readyStore();
    expect(reloaded.getState().settings.pageSize).toBe('Legal');
    expect(reloaded.getState().settings.showFooter).toBe(false);
    expect(reloaded.getState().settings.fontSize).toBe(
      DEFAULT_SETTINGS.fontSize,
    );

    const reader = await dbApi.openDatabase();
    expect((await dbApi.getDocument(reader, id))?.settings.pageSize).toBe(
      'Legal',
    );
    reader.close();
  });

  it('ignores blank renames', async () => {
    const { store } = await readyStore();

    store.getState().updateActive({ name: '   ' });
    expect(store.getState().name).toBe('Untitled document');
    expect(store.getState().saveState).toBe('saved');
  });

  it('sorts the library by recency as documents are updated', async () => {
    const { store, id } = await readyStore();
    await store.getState().createDocument();
    const secondId = store.getState().activeId!;

    vi.setSystemTime(T0 + 60_000);
    await store.getState().openDocument(id); // touches the seeded document
    store.getState().updateActive({ markdown: 'touched' });
    await store.getState().flush();

    expect(store.getState().docs.map((row) => row.id)).toEqual([id, secondId]);
  });
});

describe('create, import, duplicate, rename', () => {
  it('creates a new blank document and makes it active', async () => {
    const { store } = await readyStore();

    await store.getState().createDocument();

    expect(store.getState().name).toBe('Untitled document');
    expect(store.getState().markdown).toBe('');
    expect(store.getState().docs).toHaveLength(2);
  });

  it('keeps the shared "Untitled document" name for blank documents', async () => {
    const { store } = await readyStore();

    await store.getState().createDocument();
    await store.getState().createDocument();

    expect(store.getState().name).toBe('Untitled document');
    expect(store.getState().docs).toHaveLength(3);
    expect(
      store.getState().docs.every((row) => row.name === 'Untitled document'),
    ).toBe(true);
  });

  it('imports markdown as a new document named after the file', async () => {
    const { store } = await readyStore();

    await store.getState().importDocument('trip-report.md', '# Trip');

    expect(store.getState().name).toBe('trip-report');
    expect(store.getState().markdown).toBe('# Trip');
    expect(store.getState().docs).toHaveLength(2);
  });

  it('uniquifies imported names on collision', async () => {
    const { store } = await readyStore();

    await store.getState().importDocument('notes.md', '# One');
    await store.getState().importDocument('notes.md', '# Two');

    expect(store.getState().name).toBe('notes copy');
    expect(store.getState().markdown).toBe('# Two');
  });

  it('duplicates a document with an independent record', async () => {
    const { store, id } = await readyStore();
    store.getState().updateActive({ markdown: '# Original', name: 'Original' });
    await store.getState().flush();

    await store.getState().duplicateDocument(id);

    const state = store.getState();
    expect(state.activeId).toBe(id); // duplicating does not switch
    const copy = state.docs.find((row) => row.id !== id)!;
    expect(copy.name).toBe('Original copy');

    const reader = await dbApi.openDatabase();
    const copyRecord = await dbApi.getDocument(reader, copy.id);
    expect(copyRecord?.markdown).toBe('# Original');
    expect(copyRecord?.settings).toEqual(DEFAULT_SETTINGS);
    expect(copyRecord?.id).not.toBe(id);
    reader.close();
  });

  it('renames a non-active document directly in the library', async () => {
    const { store } = await readyStore();
    await store.getState().createDocument();
    const activeId = store.getState().activeId!;
    const targetId = store
      .getState()
      .docs.find((row) => row.id !== activeId)!.id;

    await store.getState().renameDocument(targetId, 'Renamed');

    expect(store.getState().docs.find((row) => row.id === targetId)?.name).toBe(
      'Renamed',
    );
    const reader = await dbApi.openDatabase();
    expect((await dbApi.getDocument(reader, targetId))?.name).toBe('Renamed');
    reader.close();
  });
});

describe('delete with undo', () => {
  it('deletes a document and restores it on undo', async () => {
    const first = await readyStore();
    first.store.getState().updateActive({ markdown: '# Precious' });
    await first.store.getState().flush();
    first.reset();

    const { store: fresh, id: sameId } = await readyStore();
    await fresh.getState().deleteDocument(sameId);

    expect(fresh.getState().docs).toHaveLength(0);
    expect(fresh.getState().deleteToast?.doc.id).toBe(sameId);
    expect(fresh.getState().deleteToast?.doc.markdown).toBe('# Precious');

    await fresh.getState().undoDelete();

    expect(fresh.getState().docs).toHaveLength(1);
    expect(fresh.getState().deleteToast).toBeNull();
    const reader = await dbApi.openDatabase();
    expect((await dbApi.getDocument(reader, sameId))?.markdown).toBe(
      '# Precious',
    );
    reader.close();
  });

  it('switches to the next most recent document when the active one is deleted', async () => {
    const { store } = await readyStore();
    store.getState().updateActive({ name: 'Keeper' });
    await store.getState().flush();
    const keeperId = store.getState().activeId!;
    await store.getState().createDocument();
    const doomedId = store.getState().activeId!;

    await store.getState().deleteDocument(doomedId);

    expect(store.getState().activeId).toBe(keeperId);
    expect(store.getState().docs).toHaveLength(1);
  });

  it('does not resurrect a deleted active document through a pending autosave', async () => {
    const { store, id } = await readyStore();
    store.getState().updateActive({ markdown: 'unflushed' }); // timer pending

    await store.getState().deleteDocument(id);
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    const reader = await dbApi.openDatabase();
    expect(await dbApi.getDocument(reader, id)).toBeUndefined();
    reader.close();
  });

  it('makes the deletion permanent once the toast is dismissed', async () => {
    const { store, id } = await readyStore();

    await store.getState().deleteDocument(id);
    store.getState().dismissDeleteToast();
    await store.getState().undoDelete();

    const reader = await dbApi.openDatabase();
    expect(await dbApi.getDocument(reader, id)).toBeUndefined();
    reader.close();
  });

  it('deletes a document’s exclusive assets and restores them on undo', async () => {
    const seeded = await readyStore();
    await withAssetIds(seeded.id, ['asset-1']);
    seeded.reset();

    const { store: fresh, id: sameId } = await readyStore();
    await fresh.getState().createDocument(); // keep the app on a surviving doc
    const otherId = fresh.getState().activeId!;
    await fresh.getState().openDocument(sameId);

    await fresh.getState().deleteDocument(sameId);
    let after = await dbApi.openDatabase();
    expect(await dbApi.getAsset(after, 'asset-1')).toBeUndefined();
    after.close();

    await fresh.getState().undoDelete();
    after = await dbApi.openDatabase();
    expect(await dbApi.getAsset(after, 'asset-1')).toBeDefined();
    expect((await dbApi.getDocument(after, sameId))?.assetIds).toEqual([
      'asset-1',
    ]);
    after.close();
    expect(fresh.getState().docs.map((row) => row.id)).toContain(otherId);
  });

  it('keeps assets that a duplicated sibling still references', async () => {
    const seeded = await readyStore();
    await withAssetIds(seeded.id, ['asset-1']);
    seeded.reset();

    const { store, id: sameId } = await readyStore();
    await store.getState().duplicateDocument(sameId); // duplicate shares assetIds

    await store.getState().deleteDocument(sameId);
    const after = await dbApi.openDatabase();
    expect(await dbApi.getAsset(after, 'asset-1')).toBeDefined();
    after.close();
  });
});

describe('export', () => {
  it('exports the active document including unflushed edits', async () => {
    const { store } = await readyStore();
    store.getState().updateActive({ name: 'My Notes', markdown: '# body' });

    const payload = await store
      .getState()
      .exportDocument(store.getState().activeId!);

    expect(payload).toEqual({ fileName: 'My Notes.md', markdown: '# body' });
  });

  it('exports a non-active document from storage', async () => {
    const { store } = await readyStore();
    await store.getState().importDocument('other.md', '# Other');
    const seedId = store
      .getState()
      .docs.filter((row) => row.name !== 'other')[0]!.id;

    const payload = await store.getState().exportDocument(seedId);

    expect(payload?.markdown).toBe('');
  });
});

describe('multi-tab sync', () => {
  async function twoTabs(): Promise<{ a: Store; b: Store }> {
    const tabA = createDocumentStore();
    await tabA.useStore.getState().init();
    const tabB = createDocumentStore();
    await tabB.useStore.getState().init();
    return { a: tabA.useStore, b: tabB.useStore };
  }

  it('propagates saves to other tabs, which adopt them while clean', async () => {
    const { a, b } = await twoTabs();
    const seedId = a.getState().activeId!;

    await a.getState().renameDocument(seedId, 'From tab A');
    await a.getState().flush();

    expect(b.getState().docs.find((row) => row.id === seedId)?.name).toBe(
      'From tab A',
    );
    expect(b.getState().name).toBe('From tab A');
    expect(b.getState().remotePending).toBeNull();
  });

  it('ignores stale broadcasts for the active document', async () => {
    const { a, b } = await twoTabs();
    const seedId = a.getState().activeId!;

    vi.setSystemTime(T0 + 1_000);
    await a.getState().renameDocument(seedId, 'Newer');
    await a.getState().flush();
    expect(b.getState().name).toBe('Newer');

    const stale: DocumentRecord = {
      id: seedId,
      name: 'Older',
      markdown: '',
      settings: { ...DEFAULT_SETTINGS },
      assetIds: [],
      createdAt: T0,
      updatedAt: T0 - 5_000,
    };
    stubBroadcastChannel().peers('perfectmarkd')[0]!.postMessage({
      type: 'doc-saved',
      doc: stale,
    });

    expect(b.getState().name).toBe('Newer');
  });

  it('ignores stale broadcasts while holding unflushed edits', async () => {
    const { b } = await twoTabs();
    const seedId = b.getState().activeId!;

    b.getState().updateActive({ markdown: 'mine' });
    const stale: DocumentRecord = {
      id: seedId,
      name: 'Older',
      markdown: '',
      settings: { ...DEFAULT_SETTINGS },
      assetIds: [],
      createdAt: T0,
      updatedAt: T0 - 5_000,
    };
    stubBroadcastChannel().peers('perfectmarkd')[0]!.postMessage({
      type: 'doc-saved',
      doc: stale,
    });

    // An out-of-order broadcast must not raise the staleness notice.
    expect(b.getState().remotePending).toBeNull();
    expect(b.getState().markdown).toBe('mine');
  });

  it('shows a staleness notice when a remote save races unflushed edits', async () => {
    const { a, b } = await twoTabs();
    const seedId = a.getState().activeId!;

    // Tab B has unflushed edits to the shared document.
    b.getState().updateActive({ markdown: 'mine' });
    vi.setSystemTime(T0 + 1_000);
    // Tab A saves the same document.
    await a.getState().renameDocument(seedId, 'Theirs');
    await a.getState().flush();

    expect(b.getState().remotePending?.name).toBe('Theirs');
    expect(b.getState().markdown).toBe('mine'); // untouched

    // "Load changes" adopts the remote version.
    await b.getState().loadRemoteVersion();
    expect(b.getState().markdown).toBe('');
    expect(b.getState().name).toBe('Theirs');
    expect(b.getState().remotePending).toBeNull();
  });

  it('lets the local flush win after the notice is dismissed', async () => {
    const { a, b } = await twoTabs();
    const seedId = a.getState().activeId!;

    b.getState().updateActive({ markdown: 'mine wins' });
    vi.setSystemTime(T0 + 1_000);
    await a.getState().renameDocument(seedId, 'Theirs');
    await a.getState().flush();
    b.getState().dismissRemoteVersion();

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);

    // Last writer wins wholesale: B overwrote A's rename with its own record.
    const reader = await dbApi.openDatabase();
    const winner = await dbApi.getDocument(reader, seedId);
    expect(winner?.markdown).toBe('mine wins');
    expect(winner?.name).toBe('Untitled document');
    expect(b.getState().remotePending).toBeNull();
    reader.close();
  });

  it('moves aside when another tab deletes the active document', async () => {
    const { a, b } = await twoTabs();
    const seedId = a.getState().activeId!;
    await a.getState().createDocument();
    const secondId = a.getState().activeId!;

    expect(b.getState().docs).toHaveLength(2);
    await b.getState().openDocument(secondId);
    expect(b.getState().activeId).toBe(secondId);

    await a.getState().deleteDocument(secondId);
    expect(b.getState().docs).toHaveLength(1);
    expect(b.getState().activeId).toBe(seedId); // fell back to the remaining doc

    await a.getState().deleteDocument(seedId);
    expect(b.getState().docs).toHaveLength(0);
    expect(b.getState().activeId).toBeNull();

    // No active document → no autosave → nothing resurrected.
    b.getState().updateActive({ markdown: 'still here' });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    const reader = await dbApi.openDatabase();
    expect(await dbApi.getDocument(reader, seedId)).toBeUndefined();
    expect(await dbApi.getDocument(reader, secondId)).toBeUndefined();
    reader.close();
  });
});
