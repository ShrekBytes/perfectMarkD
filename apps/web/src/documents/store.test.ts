// @vitest-environment jsdom
import { DEFAULT_SETTINGS } from '@perfectmarkd/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbApi from './db';
import { SAMPLE_MARKDOWN, SAMPLE_NAME, sampleSettings } from './sample';
import { AUTOSAVE_DELAY_MS, createDocumentStore } from './store';
import { MAX_ASSET_BYTES, parseAssetRef } from '../assets/ingest';
import { pngFile } from '../testing/test-assets';
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
    {
      id: 'asset-1',
      bytes: new Uint8Array([137, 80, 78, 71]),
      mediaType: 'image/png',
      createdAt: T0,
    },
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
  it('seeds the sample document on first run and opens it', async () => {
    const { store, id } = await readyStore();

    expect(store.getState().docs).toEqual([
      { id, name: SAMPLE_NAME, updatedAt: T0 },
    ]);
    expect(store.getState().activeId).toBe(id);
    expect(store.getState().markdown).toBe(SAMPLE_MARKDOWN);
    expect(store.getState().name).toBe(SAMPLE_NAME);
    expect(store.getState().sampleDocId).toBe(id);
    expect(store.getState().sampleDismissed).toBe(false);
    // The sample shows off the page furniture: frame + footer page numbers.
    expect(store.getState().settings.frameEnabled).toBe(true);
    expect(store.getState().settings.showPageNumbers).toBe(true);
    expect(store.getState().settings).toEqual(sampleSettings());
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

describe('sample onboarding', () => {
  it('writes the onboarding meta record on first run', async () => {
    const { store, id } = await readyStore();

    const reader = await dbApi.openDatabase();
    expect(await dbApi.getMeta(reader, 'onboarding')).toEqual({
      sampleDocId: id,
      dismissed: false,
    });
    reader.close();
    expect(store.getState().status).toBe('ready');
  });

  it('persists dismissal; the sample never auto-loads again', async () => {
    const first = await readyStore();
    const sampleId = first.id;
    await first.store.getState().dismissSample();
    first.reset();

    // Second run: the sample is still the most recent document…
    const second = await readyStore();
    expect(second.store.getState().activeId).toBe(sampleId);
    expect(second.store.getState().sampleDismissed).toBe(true);

    // …and once every document is gone, the library stays empty.
    await second.store.getState().deleteDocument(sampleId);
    expect(second.store.getState().docs).toHaveLength(0);
    expect(second.store.getState().activeId).toBeNull();
    second.reset();

    const third = await readyStore();
    expect(third.store.getState().docs).toHaveLength(0);
    expect(third.store.getState().activeId).toBeNull();
    expect(third.store.getState().sampleDocId).toBe(sampleId);
  });

  it('keeps the sample open when only the strip is dismissed', async () => {
    const { store, id } = await readyStore();

    await store.getState().dismissSample();

    expect(store.getState().activeId).toBe(id);
    expect(store.getState().sampleDismissed).toBe(true);
    const reader = await dbApi.openDatabase();
    expect(await dbApi.getMeta(reader, 'onboarding')).toEqual({
      sampleDocId: id,
      dismissed: true,
    });
    reader.close();
  });

  it('does not seed the sample for profiles that predate it', async () => {
    const writer = await dbApi.openDatabase();
    await dbApi.putDocument(writer, {
      id: 'old-1',
      name: 'Old notes',
      markdown: '# Old',
      settings: { ...DEFAULT_SETTINGS },
      assetIds: [],
      createdAt: T0,
      updatedAt: T0,
    });
    writer.close();

    const { store } = await readyStore();

    expect(store.getState().docs.map((row) => row.name)).toEqual(['Old notes']);
    expect(store.getState().activeId).toBe('old-1');
    expect(store.getState().sampleDocId).toBeNull();
    expect(store.getState().sampleDismissed).toBe(false);
  });
});

describe('editing and autosave', () => {
  it('debounces edits and persists them after the delay', async () => {
    const { store, id } = await readyStore();

    store.getState().updateActive({ markdown: '# Hello' });
    expect(store.getState().saveState).toBe('saving');

    const reader = await dbApi.openDatabase();
    // The seeded record (sample content) is already durable before the edit.
    expect((await dbApi.getDocument(reader, id))?.markdown).toBe(
      SAMPLE_MARKDOWN,
    );

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
    expect(store.getState().name).toBe(SAMPLE_NAME);
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
    expect(store.getState().docs).toHaveLength(3); // sample plus two blanks
    expect(
      store.getState().docs.filter((row) => row.name === 'Untitled document'),
    ).toHaveLength(2);
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
    expect(copyRecord?.settings).toEqual(sampleSettings());
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

describe('addAsset', () => {
  it('stores the asset, returns the markdown ref, and persists the reference', async () => {
    const { store, id } = await readyStore();

    const result = await store.getState().addAsset(pngFile('sunrise.png'));

    expect(result).toMatchObject({ ok: true, alt: 'sunrise' });
    if (!result.ok) throw new Error('expected ok');
    expect(result.ref).toMatch(/^asset:\/\/[a-z0-9-]+$/i);

    // The asset is durable immediately, before any autosave…
    const reader = await dbApi.openDatabase();
    const assetId = parseAssetRef(result.ref)!;
    const asset = await dbApi.getAsset(reader, assetId);
    expect(asset?.mediaType).toBe('image/png');
    // fake-indexeddb's clone hands bytes back as an array-like under jsdom;
    // compare bytewise rather than by typed-array identity.
    expect(Array.from(asset?.bytes ?? [])).toEqual(new Array(8).fill(0));

    // …and the reference rides the next flush even without a markdown edit.
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect((await dbApi.getDocument(reader, id))?.assetIds).toEqual([assetId]);
    reader.close();
  });

  it('refuses oversized files without touching the document', async () => {
    const { store, id } = await readyStore();

    const result = await store
      .getState()
      .addAsset(pngFile('big.png', MAX_ASSET_BYTES + 1));

    expect(result).toEqual({ ok: false, error: 'too-large' });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    const reader = await dbApi.openDatabase();
    expect((await dbApi.getDocument(reader, id))?.assetIds).toEqual([]);
    reader.close();
  });

  it('refuses files that are not images', async () => {
    const { store } = await readyStore();

    const result = await store
      .getState()
      .addAsset(
        new File([new Uint8Array(8)], 'paper.pdf', { type: 'application/pdf' }),
      );

    expect(result).toEqual({ ok: false, error: 'unsupported' });
  });

  it('keeps assets across a reload', async () => {
    const first = await readyStore();
    const result = await first.store.getState().addAsset(pngFile());
    if (!result.ok) throw new Error('expected ok');
    await first.store.getState().flush();
    first.reset();

    await readyStore();
    const reader = await dbApi.openDatabase();
    const asset = await dbApi.getAsset(reader, parseAssetRef(result.ref)!);
    expect(Array.from(asset?.bytes ?? [])).toEqual(new Array(8).fill(0));
    expect(asset?.mediaType).toBe('image/png');
    reader.close();
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

    expect(payload?.markdown).toBe(SAMPLE_MARKDOWN);
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
    expect(b.getState().markdown).toBe(SAMPLE_MARKDOWN);
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
    expect(winner?.name).toBe(SAMPLE_NAME);
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
