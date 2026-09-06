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

/** Row shape for the Library list: id + name + recency. */
export type DocumentSummary = Pick<DocumentRecord, 'id' | 'name' | 'updatedAt'>;
