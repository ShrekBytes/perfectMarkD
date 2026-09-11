// ─────────────────────────────────────────────────────────────────────────────
// Export History API client (server/05). Same shape as billing/api.ts:
// same-origin fetches, session in the httpOnly cookie, errors crossing this
// boundary as ApiError carrying the server's message (and status, so the
// modal can tell a Premium gate from a real failure).
// ─────────────────────────────────────────────────────────────────────────────

import { errorFrom } from '../api/client';
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

/** The user's re-downloadable Server Exports, newest first (server sorts). */
export async function listHistory(): Promise<HistoryEntry[]> {
  const res = await fetch('/api/history', { credentials: 'include' });
  if (!res.ok) throw await errorFrom(res);
  return ((await res.json()) as { entries: HistoryEntry[] }).entries;
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
