// ─────────────────────────────────────────────────────────────────────────────
// Persisted document model (IndexedDB "documents" + "assets" stores).
// ─────────────────────────────────────────────────────────────────────────────

import type { DocumentSettings } from '@perfectmarkd/core';

/** One document in the local library: markdown source plus its settings
 *  snapshot. Assets (images) live in a separate store; assetIds lists the ids
 *  this document references (as asset://<id> refs in the markdown). */
export interface DocumentRecord {
  id: string;
  name: string;
  markdown: string;
  settings: DocumentSettings;
  assetIds: string[];
  createdAt: number;
  updatedAt: number;
  /** Total Pages from the last successful Paper Canvas render of this
   *  Document; null (legacy records, never-rendered documents) shows no
   *  count anywhere — absence, not an estimate. */
  pageCount: number | null;
}

/** A binary asset owned by whichever documents reference its id. Stored as
 *  raw bytes plus media type (not a Blob): bytes survive structured clone
 *  everywhere, and the resolver rebuilds a Blob — or a data: URI for export —
 *  on read. */
export interface AssetRecord {
  id: string;
  /** ArrayBuffer-backed so the bytes double as a Blob part at resolve time. */
  bytes: Uint8Array<ArrayBuffer>;
  mediaType: string;
  createdAt: number;
}

/** Row shape for the Library list: id, name, recency, page count, and the
 *  settings snapshot the row's miniature-sheet thumbnail sketches from. */
export type DocumentSummary = Pick<
  DocumentRecord,
  'id' | 'name' | 'updatedAt' | 'pageCount' | 'settings'
>;

/** An uploaded custom font in the user's library (billing/05). Bytes + media
 *  type follow the image AssetRecord pattern, but fonts live in their own
 *  `fonts` store and are user-level, not per-document: every uploaded font
 *  is offered in every document's font pickers, so no assetIds coupling and
 *  no orphan collection — a font stays until the user removes it. */
export interface FontRecord {
  id: string;
  /** The CSS font-family name the face is registered under (derived from
   *  the file name at upload; settings reference it via customFontName). */
  family: string;
  /** ArrayBuffer-backed so the bytes double as a Blob part at load time. */
  bytes: Uint8Array<ArrayBuffer>;
  mediaType: string;
  createdAt: number;
}
