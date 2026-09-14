// ─────────────────────────────────────────────────────────────────────────────
// The document store: one Zustand store owning the local library (IndexedDB)
// plus the working copy of the active document.
//
// Persistence rules:
// - Edits to the active document autosave debounced (AUTOSAVE_DELAY_MS) and
//   flush immediately on tab hide / beforeunload / document switches.
// - Every write broadcasts the record over a BroadcastChannel; peers apply
//   last-writer-wins. When a peer's write arrives while we hold unflushed
//   edits, we keep ours, surface it as a staleness notice, and let the next
//   flush decide the winner.
// - Deletes are undoable: the record and its now-orphaned assets are kept in
//   memory until the toast's Undo is dismissed.
// ─────────────────────────────────────────────────────────────────────────────

import {
  DEFAULT_SETTINGS,
  validate,
  type DocumentSettings,
} from '@perfectmarkd/core';
import type { IDBPDatabase } from 'idb';
import { create } from 'zustand';
import { assetRef, prepareAsset, type AssetSource } from '../assets/ingest';
import * as dbApi from './db';
import { SAMPLE_MARKDOWN, SAMPLE_NAME, sampleSettings } from './sample';
import { exportFileName, nameFromFile, uniqueName } from './text';
import type { AssetRecord, DocumentRecord, DocumentSummary } from './types';

export const AUTOSAVE_DELAY_MS = 500;
const CHANNEL_NAME = 'perfectmarkd';
const ACTIVE_DOC_KEY = 'perfectmarkd:activeDoc';
const ONBOARDING_KEY = 'onboarding';
const UNTITLED = 'Untitled document';

/** Persisted under the ONBOARDING_KEY meta record: which document is the
 *  auto-created sample and whether the welcome strip was dismissed. Present
 *  in the database from the first run on, so the sample is seeded only once —
 *  never re-created after dismissal, and not re-created for profiles that
 *  predate it (they have documents but no meta record). */
export interface OnboardingMeta {
  sampleDocId: string | null;
  dismissed: boolean;
}

export type SaveState = 'saved' | 'saving';

/** Data backing the delete toast: the record to restore plus the assets that
 *  were removed along with it. */
export interface DeleteSnapshot {
  doc: DocumentRecord;
  assets: AssetRecord[];
}

/** What the UI needs to download a document as a .md file. */
export interface ExportPayload {
  fileName: string;
  markdown: string;
}

/** Outcome of storing one pasted/dropped/picked image against the active
 *  document. On success the caller inserts `ref` as `![alt](ref)` markdown. */
export type AddAssetResult =
  | { ok: true; ref: string; alt: string }
  | { ok: false; error: 'too-large' | 'unsupported' | 'no-document' };

export interface DocumentStore {
  status: 'loading' | 'ready';
  /** Library rows, most recently updated first. */
  docs: DocumentSummary[];
  activeId: string | null;
  /** The auto-created first-run sample document, when it exists. */
  sampleDocId: string | null;
  /** True once the sample welcome strip was dismissed (persisted). */
  sampleDismissed: boolean;
  /** Working copy of the active document. */
  name: string;
  markdown: string;
  settings: DocumentSettings;
  /** Pages the Paper Canvas last reported for the active document this
   *  session — the top-bar gauge reads it. Null until the canvas reports,
   *  and on every document switch (the gauge never shows a count the
   *  canvas has not produced). */
  pageCount: number | null;
  saveState: SaveState;
  /** A peer's newer version of the active document we chose not to apply. */
  remotePending: DocumentRecord | null;
  deleteToast: DeleteSnapshot | null;

  init(): Promise<void>;
  createDocument(): Promise<void>;
  openDocument(id: string): Promise<void>;
  /** Marks the sample document dismissed: the strip hides and the sample is
   *  never auto-loaded again. */
  dismissSample(): Promise<void>;
  /** The welcome strip's "Start a blank document": dismiss the sample, then
   *  open a fresh blank document. */
  startBlankDocument(): Promise<void>;
  updateActive(patch: {
    name?: string;
    markdown?: string;
    settings?: Partial<DocumentSettings>;
  }): void;
  /** Reports the active document's total page count from a successful
   *  Paper Canvas render (including the large-document guard path, where
   *  pagination has run but mounting is deferred). Merges into the record
   *  so it rides the existing debounced autosave and its doc-saved
   *  broadcast; the Library row updates immediately. */
  recordPageCount(count: number): void;
  renameDocument(id: string, name: string): Promise<void>;
  duplicateDocument(id: string): Promise<void>;
  deleteDocument(id: string): Promise<void>;
  undoDelete(): Promise<void>;
  dismissDeleteToast(): void;
  importDocument(fileName: string, markdown: string): Promise<void>;
  /** Stores an image as a local asset and attaches it to the active document;
   *  returns the `asset://` ref the editor inserts into the markdown. */
  addAsset(file: AssetSource): Promise<AddAssetResult>;
  /** Persists unflushed edits first, then returns the download payload. */
  exportDocument(id: string): Promise<ExportPayload | null>;
  loadRemoteVersion(): Promise<void>;
  dismissRemoteVersion(): void;
  /** Immediate save of unflushed edits (tab hide, beforeunload, …). */
  flush(): Promise<void>;
}

type RemoteMessage =
  | { type: 'doc-saved'; doc: DocumentRecord }
  | { type: 'doc-deleted'; id: string };

const INITIAL_STATE = {
  status: 'loading' as const,
  docs: [] as DocumentSummary[],
  activeId: null,
  sampleDocId: null,
  sampleDismissed: false,
  name: '',
  markdown: '',
  settings: { ...DEFAULT_SETTINGS },
  pageCount: null,
  saveState: 'saved' as SaveState,
  remotePending: null,
  deleteToast: null,
};

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function newRecord(
  name: string,
  markdown: string,
  now: number,
  settings: DocumentSettings = { ...DEFAULT_SETTINGS },
): DocumentRecord {
  return {
    id: newId(),
    name,
    markdown,
    settings,
    assetIds: [],
    createdAt: now,
    updatedAt: now,
    pageCount: null,
  };
}

function toSummary(doc: DocumentRecord): DocumentSummary {
  return {
    id: doc.id,
    name: doc.name,
    updatedAt: doc.updatedAt,
    pageCount: doc.pageCount,
    settings: doc.settings,
  };
}

/** Replaces or inserts the record's row and keeps recency order. */
function upsertDoc(
  list: DocumentSummary[],
  doc: DocumentRecord,
): DocumentSummary[] {
  return [toSummary(doc), ...list.filter((row) => row.id !== doc.id)].sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );
}

function readActiveDocId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_DOC_KEY);
  } catch {
    return null;
  }
}

function writeActiveDocId(id: string | null): void {
  try {
    if (id) localStorage.setItem(ACTIVE_DOC_KEY, id);
    else localStorage.removeItem(ACTIVE_DOC_KEY);
  } catch {
    // Storage unavailable; the tab simply won't reopen the same document.
  }
}

/**
 * Creates an isolated store instance. Production uses the `useDocumentStore`
 * singleton; tests create their own instances against stubbed globals
 * (IndexedDB, BroadcastChannel) to simulate tabs and reloads.
 */
export function createDocumentStore() {
  let dbp: IDBPDatabase | null = null;
  let channel: BroadcastChannel | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** The active document as last persisted; dirty = working copy differs. */
  let savedRecord: DocumentRecord | null = null;
  let dirty = false;
  /** Asset ids stored since the last flush (addAsset); they merge into the
   *  next write of the active record. Kept outside savedRecord so a peer's
   *  last-writer-wins adoption between addAsset and flush cannot drop them. */
  let pendingAssetIds: string[] = [];
  let initPromise: Promise<void> | null = null;

  const useStore = create<DocumentStore>()((set, get) => {
    /** Writes the record to IndexedDB and tells other tabs. */
    async function persistAndBroadcast(record: DocumentRecord): Promise<void> {
      await dbApi.putDocument(dbp!, record);
      channel?.postMessage({
        type: 'doc-saved',
        doc: record,
      } satisfies RemoteMessage);
    }

    /** After the active document disappeared, fall back to the most recent
     *  remaining document (or to no active document). */
    async function activateFallback(docs: DocumentSummary[]): Promise<void> {
      const next = docs[0];
      if (next) await get().openDocument(next.id);
      else
        set({
          activeId: null,
          name: '',
          markdown: '',
          pageCount: null,
          remotePending: null,
        });
    }

    async function flush(): Promise<void> {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      if (!dirty || !dbp || !savedRecord) return;

      const assetIds =
        pendingAssetIds.length > 0
          ? [...new Set([...savedRecord.assetIds, ...pendingAssetIds])]
          : savedRecord.assetIds;
      pendingAssetIds = [];
      const record: DocumentRecord = {
        ...savedRecord,
        assetIds,
        name: get().name,
        markdown: get().markdown,
        settings: { ...get().settings },
        updatedAt: Date.now(),
      };
      dirty = false;
      await dbApi.putDocument(dbp, record);
      savedRecord = record;

      // A newer edit may have arrived while the write was in flight.
      if (!dirty) set({ saveState: 'saved', remotePending: null });
      set((state) => ({ docs: upsertDoc(state.docs, record) }));
      channel?.postMessage({
        type: 'doc-saved',
        doc: record,
      } satisfies RemoteMessage);
    }

    function scheduleFlush(): void {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        void flush();
      }, AUTOSAVE_DELAY_MS);
    }

    /** Drops a pending autosave without writing (used before deletes). */
    function cancelPendingSave(): void {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      dirty = false;
    }

    function setWorkingCopy(record: DocumentRecord): void {
      savedRecord = record;
      dirty = false;
      // validate() carries the settings migration (legacy violet → graphite)
      // so documents persisted before a token rewrite re-render in the new
      // world.
      set({
        activeId: record.id,
        name: record.name,
        markdown: record.markdown,
        settings: validate({ ...record.settings }),
        // The gauge's count is canvas-produced, not record-carried: it
        // joins when this document's first render lands.
        pageCount: null,
        saveState: 'saved',
        remotePending: null,
        docs: upsertDoc(get().docs, record),
      });
    }

    async function handleRemoteMessage(message: RemoteMessage): Promise<void> {
      if (get().status !== 'ready') return;

      if (message.type === 'doc-deleted') {
        const { id } = message;
        const docs = get().docs.filter((row) => row.id !== id);
        set({ docs });
        if (get().activeId === id) {
          // The peer removed our active document; move aside without resurrecting it.
          cancelPendingSave();
          await activateFallback(docs);
        }
        return;
      }

      const { doc } = message;
      if (doc.id === get().activeId && savedRecord) {
        if (doc.updatedAt < savedRecord.updatedAt) return; // stale broadcast
        if (dirty) {
          // We hold unflushed edits; keep them and surface the conflict.
          set({ remotePending: doc, docs: upsertDoc(get().docs, doc) });
          return;
        }
        setWorkingCopy(doc); // clean: adopt last-writer-wins
        return;
      }
      set((state) => ({ docs: upsertDoc(state.docs, doc) }));
    }

    return {
      ...INITIAL_STATE,

      init: async () => {
        if (initPromise) return initPromise;
        initPromise = (async () => {
          dbp = await dbApi.openDatabase();
          if (typeof BroadcastChannel !== 'undefined') {
            channel = new BroadcastChannel(CHANNEL_NAME);
            channel.onmessage = (event: MessageEvent) =>
              handleRemoteMessage(event.data as RemoteMessage);
          }
          window.addEventListener('pagehide', () => void flush());
          document.addEventListener('visibilitychange', () => {
            if (document.hidden) void flush();
          });

          const meta =
            (await dbApi.getMeta<OnboardingMeta>(dbp, ONBOARDING_KEY)) ?? null;
          const docs = await dbApi.listDocuments(dbp);

          if (!meta && docs.length === 0) {
            // First visit: seed the sample document and open it. The meta
            // record marks the first run as seen, so the sample is created
            // exactly once — the dismissed flag only governs the strip.
            const record = newRecord(
              SAMPLE_NAME,
              SAMPLE_MARKDOWN,
              Date.now(),
              sampleSettings(),
            );
            await persistAndBroadcast(record);
            await dbApi.putMeta(dbp, ONBOARDING_KEY, {
              sampleDocId: record.id,
              dismissed: false,
            } satisfies OnboardingMeta);
            writeActiveDocId(record.id);
            setWorkingCopy(record);
            set({
              status: 'ready',
              docs: [toSummary(record)],
              sampleDocId: record.id,
              sampleDismissed: false,
            });
            return;
          }

          const onboarding = {
            sampleDocId: meta?.sampleDocId ?? null,
            sampleDismissed: meta?.dismissed ?? false,
          };
          const wanted = readActiveDocId();
          const active = docs.find((doc) => doc.id === wanted) ?? docs[0];
          if (!active) {
            set({ status: 'ready', docs: docs.map(toSummary), ...onboarding });
            return;
          }
          const record = await dbApi.getDocument(dbp, active.id);
          if (!record) {
            set({ status: 'ready', docs: docs.map(toSummary), ...onboarding });
            return;
          }
          writeActiveDocId(record.id);
          setWorkingCopy(record);
          set({
            status: 'ready',
            docs: docs.map(toSummary),
            ...onboarding,
          });
        })();
        return initPromise;
      },

      createDocument: async () => {
        if (!dbp) return;
        await flush();
        // Blank documents all share the "Untitled document" name, like most
        // editors; uniqueness only matters where the name is derived (copies,
        // imports) to keep collisions out of the library.
        const record = newRecord(UNTITLED, '', Date.now());
        await persistAndBroadcast(record);
        writeActiveDocId(record.id);
        setWorkingCopy(record);
      },

      openDocument: async (id) => {
        if (!dbp || id === get().activeId) return;
        await flush();
        const record = await dbApi.getDocument(dbp, id);
        if (!record) {
          set({ docs: (await dbApi.listDocuments(dbp)).map(toSummary) });
          return;
        }
        writeActiveDocId(id);
        setWorkingCopy(record);
      },

      dismissSample: async () => {
        if (get().sampleDismissed) return;
        set({ sampleDismissed: true });
        if (!dbp) return;
        await dbApi.putMeta(dbp, ONBOARDING_KEY, {
          sampleDocId: get().sampleDocId,
          dismissed: true,
        } satisfies OnboardingMeta);
      },

      startBlankDocument: async () => {
        await get().dismissSample();
        await get().createDocument();
      },

      updateActive: (patch) => {
        if (!get().activeId) return;
        const name = patch.name?.trim();
        if (patch.name !== undefined && !name) return; // never blank a document's name
        set((state) => ({
          name: name ?? state.name,
          markdown: patch.markdown ?? state.markdown,
          settings: patch.settings
            ? { ...state.settings, ...patch.settings }
            : state.settings,
          saveState: 'saving',
          docs:
            name !== undefined
              ? state.docs.map((row) =>
                  row.id === state.activeId ? { ...row, name: name! } : row,
                )
              : state.docs,
        }));
        dirty = true;
        scheduleFlush();
      },

      recordPageCount: (count) => {
        if (!savedRecord) return;
        const updated =
          savedRecord.pageCount === count
            ? null
            : { ...savedRecord, pageCount: count };
        if (updated) {
          savedRecord = updated;
          // Same merge-and-ride contract as addAsset: an edit-driven render's
          // count rides the autosave that edit already scheduled; a render
          // without pending edits (first open, the guard path, a manual
          // render) schedules one flush so the Library learns the true size.
          // No save-state churn — the gauge is a readout, not an edit.
          dirty = true;
          if (!saveTimer) scheduleFlush();
        }
        // The live readout joins even when the record already carries this
        // count (a reopen whose first render re-reports it): the gauge and
        // the canvas's "Page N of M" may never disagree.
        set((state) => ({
          pageCount: count,
          docs: updated ? upsertDoc(state.docs, updated) : state.docs,
        }));
      },

      renameDocument: async (id, name) => {
        if (id === get().activeId) {
          get().updateActive({ name });
          return;
        }
        if (!dbp) return;
        const record = await dbApi.getDocument(dbp, id);
        if (!record || record.name === name) return;
        const renamed = { ...record, name, updatedAt: Date.now() };
        await persistAndBroadcast(renamed);
        set((state) => ({ docs: upsertDoc(state.docs, renamed) }));
      },

      duplicateDocument: async (id) => {
        if (!dbp) return;
        const source = await dbApi.getDocument(dbp, id);
        if (!source) return;
        const now = Date.now();
        const copy: DocumentRecord = {
          ...source,
          settings: { ...source.settings },
          id: newId(),
          name: uniqueName(
            get().docs.map((row) => row.name),
            `${source.name} copy`,
          ),
          createdAt: now,
          updatedAt: now,
          // Counts come only from this record's own renders; the copy
          // reports when the writer first opens it.
          pageCount: null,
        };
        await persistAndBroadcast(copy);
        set((state) => ({ docs: upsertDoc(state.docs, copy) }));
      },

      deleteDocument: async (id) => {
        if (!dbp) return;
        // Land unflushed edits on the active document first: the toast and
        // undo snapshot are built from the stored record, so deleting before
        // the autosave (500ms) would surface the pre-edit name/content there.
        // Same persist-first contract as exportDocument.
        if (id === get().activeId) await flush();
        const record = await dbApi.getDocument(dbp, id);
        if (!record) return;

        // Assets orphaned by this deletion (owned by no other document).
        const remaining = get().docs.filter((row) => row.id !== id);
        const keptAssetIds = new Set<string>();
        for (const row of remaining) {
          for (const assetId of (await dbApi.getDocument(dbp, row.id))
            ?.assetIds ?? []) {
            keptAssetIds.add(assetId);
          }
        }
        const orphanedIds = record.assetIds.filter(
          (assetId) => !keptAssetIds.has(assetId),
        );
        const orphanedAssets = await dbApi.getAssets(dbp, orphanedIds);

        await dbApi.deleteDocument(dbp, id);
        await dbApi.deleteAssets(dbp, orphanedIds);
        channel?.postMessage({
          type: 'doc-deleted',
          id,
        } satisfies RemoteMessage);

        const docs = remaining;
        set({ docs, deleteToast: { doc: record, assets: orphanedAssets } });
        if (id === get().activeId) await activateFallback(docs);
      },

      undoDelete: async () => {
        const snapshot = get().deleteToast;
        if (!snapshot || !dbp) return;
        await dbApi.putDocument(dbp, snapshot.doc);
        await dbApi.putAssets(dbp, snapshot.assets);
        channel?.postMessage({
          type: 'doc-saved',
          doc: snapshot.doc,
        } satisfies RemoteMessage);
        set((state) => ({
          docs: upsertDoc(state.docs, snapshot.doc),
          deleteToast: null,
        }));
      },
      dismissDeleteToast: () => set({ deleteToast: null }),

      importDocument: async (fileName, markdown) => {
        if (!dbp) return;
        await flush();
        const record = newRecord(
          uniqueName(
            get().docs.map((row) => row.name),
            nameFromFile(fileName),
          ),
          markdown,
          Date.now(),
        );
        await persistAndBroadcast(record);
        writeActiveDocId(record.id);
        setWorkingCopy(record);
      },

      addAsset: async (file) => {
        if (!dbp || !get().activeId || !savedRecord) {
          return { ok: false, error: 'no-document' };
        }
        const prepared = await prepareAsset(file);
        if (!prepared.ok) return prepared;

        const id = newId();
        const asset: AssetRecord = {
          id,
          bytes: prepared.asset.bytes,
          mediaType: prepared.asset.mediaType,
          createdAt: Date.now(),
        };
        // Durable before the ref enters the markdown, so a peer that adopts
        // the saved document can always resolve what it references.
        await dbApi.putAssets(dbp, [asset]);
        pendingAssetIds.push(id);
        dirty = true;
        scheduleFlush();
        return { ok: true, ref: assetRef(id), alt: prepared.asset.alt };
      },

      exportDocument: async (id) => {
        if (!dbp) return null;
        if (id === get().activeId) await flush();
        const record = await dbApi.getDocument(dbp, id);
        if (!record) return null;
        return {
          fileName: exportFileName(record.name),
          markdown: record.markdown,
        };
      },

      loadRemoteVersion: async () => {
        const pending = get().remotePending;
        if (!pending) return;
        setWorkingCopy(pending);
      },

      dismissRemoteVersion: () => set({ remotePending: null }),

      flush: async () => {
        await flush();
      },
    };
  });

  /** Test hook: full in-memory reset; connections are closed so a fresh
   *  `init()` against the same stubbed IndexedDB simulates a reload. */
  function resetForTests(): void {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    channel?.close();
    channel = null;
    void dbp?.close();
    dbp = null;
    savedRecord = null;
    dirty = false;
    pendingAssetIds = [];
    initPromise = null;
    useStore.setState({ ...INITIAL_STATE, settings: { ...DEFAULT_SETTINGS } });
  }

  return { useStore, resetForTests };
}

/** The app-wide store singleton. */
export const documentStore = createDocumentStore();
export const useDocumentStore = documentStore.useStore;

/** Test hook for the singleton (component tests). */
export const resetDocumentStoreForTests = documentStore.resetForTests;
