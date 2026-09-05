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

import { DEFAULT_SETTINGS, type DocumentSettings } from '@perfectmarkd/core';
import type { IDBPDatabase } from 'idb';
import { create } from 'zustand';
import * as dbApi from './db';
import { exportFileName, nameFromFile, uniqueName } from './text';
import type { AssetRecord, DocumentRecord, DocumentSummary } from './types';

export const AUTOSAVE_DELAY_MS = 500;
const CHANNEL_NAME = 'perfectmarkd';
const ACTIVE_DOC_KEY = 'perfectmarkd:activeDoc';
const UNTITLED = 'Untitled document';

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

export interface DocumentStore {
  status: 'loading' | 'ready';
  /** Library rows, most recently updated first. */
  docs: DocumentSummary[];
  activeId: string | null;
  /** Working copy of the active document. */
  name: string;
  markdown: string;
  settings: DocumentSettings;
  saveState: SaveState;
  /** A peer's newer version of the active document we chose not to apply. */
  remotePending: DocumentRecord | null;
  deleteToast: DeleteSnapshot | null;

  init(): Promise<void>;
  createDocument(): Promise<void>;
  openDocument(id: string): Promise<void>;
  updateActive(patch: {
    name?: string;
    markdown?: string;
    settings?: Partial<DocumentSettings>;
  }): void;
  renameDocument(id: string, name: string): Promise<void>;
  duplicateDocument(id: string): Promise<void>;
  deleteDocument(id: string): Promise<void>;
  undoDelete(): Promise<void>;
  dismissDeleteToast(): void;
  importDocument(fileName: string, markdown: string): Promise<void>;
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
  name: '',
  markdown: '',
  settings: { ...DEFAULT_SETTINGS },
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
): DocumentRecord {
  return {
    id: newId(),
    name,
    markdown,
    settings: { ...DEFAULT_SETTINGS },
    assetIds: [],
    createdAt: now,
    updatedAt: now,
  };
}

function toSummary(doc: DocumentRecord): DocumentSummary {
  return { id: doc.id, name: doc.name, updatedAt: doc.updatedAt };
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
          remotePending: null,
        });
    }

    async function flush(): Promise<void> {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      if (!dirty || !dbp || !savedRecord) return;

      const record: DocumentRecord = {
        ...savedRecord,
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
      set({
        activeId: record.id,
        name: record.name,
        markdown: record.markdown,
        settings: { ...record.settings },
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

          let docs = await dbApi.listDocuments(dbp);
          if (docs.length === 0) {
            // First run: seed one blank document so the app is ready to type in.
            const record = newRecord(UNTITLED, '', Date.now());
            await persistAndBroadcast(record);
            docs = [record];
            writeActiveDocId(record.id);
            setWorkingCopy(record);
            set({ status: 'ready' });
            return;
          }

          const wanted = readActiveDocId();
          const active = docs.find((doc) => doc.id === wanted) ?? docs[0];
          if (!active) {
            set({ status: 'ready', docs: docs.map(toSummary) });
            return;
          }
          const record = await dbApi.getDocument(dbp, active.id);
          if (!record) {
            set({ status: 'ready', docs: docs.map(toSummary) });
            return;
          }
          writeActiveDocId(record.id);
          setWorkingCopy(record);
          set({ status: 'ready', docs: docs.map(toSummary) });
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
        };
        await persistAndBroadcast(copy);
        set((state) => ({ docs: upsertDoc(state.docs, copy) }));
      },

      deleteDocument: async (id) => {
        if (!dbp) return;
        if (id === get().activeId) cancelPendingSave();
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
