// ─────────────────────────────────────────────────────────────────────────────
// Export History API client (server/05). Same shape as billing/api.ts:
// same-origin fetches, session in the httpOnly cookie, errors crossing this
// boundary as ApiError carrying the server's message (and status, so the
// modal can tell a Premium gate from a real failure).
// ─────────────────────────────────────────────────────────────────────────────

import { ApiError, errorFrom, FALLBACK_CODE } from '../api/client';
import { downloadBlob } from '../library/download';

export interface HistoryEntry {
  id: number;
  name: string;
  pages: number;
  /** The plaintext PDF's size — the download is the decrypted file. */
  sizeBytes: number;
  createdAt: string;
  expiresAt: string;
}

/** The user's re-downloadable Server Exports, newest first (server sorts).
 *  Validated like listOrders: a 200 with the wrong envelope is an ApiError,
 *  never `undefined` reaching the list. */
export async function listHistory(): Promise<HistoryEntry[]> {
  const res = await fetch('/api/history', { credentials: 'include' });
  if (!res.ok) throw await errorFrom(res);
  const body: unknown = await res.json().catch(() => null);
  const entries =
    typeof body === 'object' &&
    body !== null &&
    Array.isArray(
      (
        body as {
          entries?: unknown;
        }
      ).entries,
    )
      ? (body as { entries: HistoryEntry[] }).entries
      : null;
  if (entries === null) {
    throw new ApiError(
      'The export history came back in a shape this page can’t read.',
      res.status,
      FALLBACK_CODE,
    );
  }
  return entries;
}

/**
 * Fetches one stored export (the server decrypts) and saves it. The name
 * always downloads as a .pdf, whatever the document was titled.
 */
export async function downloadHistoryPdf(entry: HistoryEntry): Promise<void> {
  const res = await fetch(`/api/history/${entry.id}`, {
    credentials: 'include',
  });
  if (!res.ok) throw await errorFrom(res);
  const blob = await res.blob();
  downloadBlob(
    entry.name.toLowerCase().endsWith('.pdf')
      ? entry.name
      : `${entry.name}.pdf`,
    blob,
  );
}
