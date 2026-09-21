// ─────────────────────────────────────────────────────────────────────────────
// The custom font library (billing/05): one small store so the Inspector's
// upload control and the font pickers agree on what's uploaded. Fonts are
// user-level — every upload is offered in every document's pickers — so this
// is a separate store from the per-document asset handling, backed by the
// `fonts` IndexedDB store.
//
// Faces register through the FontFace API (loader.ts) the moment they arrive,
// so the preview renders instantly with no server round-trip; the same
// registration re-runs per render via ensureCustomFontsLoaded.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import { deleteFont, listFonts, openDatabase, putFont } from '../documents/db';
import type { FontRecord } from '../documents/types';
import { prepareFont, type FontIngestError } from './ingest';
import { registerCustomFont, unregisterCustomFont } from './loader';

export type AddFontResult =
  { ok: true; family: string } | { ok: false; error: FontIngestError };

interface CustomFontState {
  fonts: FontRecord[];
  /** True once the first library read has landed. */
  loaded: boolean;
  /** Reads the library from IndexedDB; safe to call from several mounts. */
  load: () => Promise<void>;
  /** Validates, registers, and persists one font upload. A font that fails
   *  the real FontFace parse is refused before it reaches the library. */
  add: (file: File) => Promise<AddFontResult>;
  /** Removes a font from the library and unregisters its face; documents
   *  that still select it fall back to their CSS stack. */
  remove: (id: string) => Promise<void>;
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `font-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const useCustomFontStore = create<CustomFontState>()((set, get) => ({
  fonts: [],
  loaded: false,

  load: async () => {
    const db = await openDatabase();
    set({ fonts: await listFonts(db), loaded: true });
  },

  add: async (file) => {
    const prepared = await prepareFont(file);
    if (!prepared.ok) return prepared;

    // Replace-on-same-family: re-uploading a name overwrites the old face
    // (and its registration), never two entries answering to one family.
    const family = prepared.font.family;
    const replaced = get().fonts.filter((f) => f.family === family);
    if (replaced.length > 0) unregisterCustomFont(family);

    const verdict = await registerCustomFont(prepared.font);
    if (verdict === 'invalid') return { ok: false, error: 'invalid' };

    const font: FontRecord = {
      id: newId(),
      family,
      bytes: prepared.font.bytes,
      mediaType: prepared.font.mediaType,
      createdAt: Date.now(),
    };
    const db = await openDatabase();
    // The replaced rows leave memory and the store together.
    for (const { id } of replaced) await deleteFont(db, id);
    await putFont(db, font);
    set({
      fonts: [...get().fonts.filter((f) => f.family !== family), font].sort(
        (a, b) => a.family.localeCompare(b.family),
      ),
      loaded: true,
    });
    return { ok: true, family };
  },

  remove: async (id) => {
    const record = get().fonts.find((f) => f.id === id);
    const db = await openDatabase();
    await deleteFont(db, id);
    if (record) unregisterCustomFont(record.family);
    set({ fonts: get().fonts.filter((f) => f.id !== id) });
  },
}));
