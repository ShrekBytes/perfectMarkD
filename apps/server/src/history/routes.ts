// ─────────────────────────────────────────────────────────────────────────────
// Export History API (server/05).
//
// GET /api/history — the user's re-downloadable Server Export PDFs (Premium
// only, 30-day retention). GET /api/history/:id — decrypts and streams one.
// The whole router sits behind the Premium gate: Export History is the one
// tier differentiator Pro does not have (PLAN.md §1), and the typed
// `premium_required` rejection is what the web modal matches on.
//
// No request ever touches a document: the server streams bytes it already
// holds — nothing here logs content (spec §Security posture).
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono';
import { Readable } from 'node:stream';
import type { AppEnv } from '../index.js';
import type { Clock } from '../auth/sessions.js';
import { findActiveEntitlement } from '../quota.js';
import {
  HistoryExpiredError,
  HistoryNotFoundError,
  type ExportHistoryRow,
  type HistoryStore,
} from './store.js';

export interface HistoryRoutesOptions {
  store: HistoryStore;
  now: Clock;
}

/** The History modal's entry shape. Timestamps are ISO strings. */
export function historyEntryView(row: ExportHistoryRow) {
  return {
    id: row.id,
    name: row.name,
    pages: row.pages,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

export function historyRoutes({ store, now }: HistoryRoutesOptions) {
  const app = new Hono<AppEnv>();

  // The Premium gate, applied to every route below: signed in, active
  // Entitlement, plan === premium. An expired Premium row reports as
  // inactive (the same "active" every other gate reads), so expiry re-locks
  // History the same way it re-locks the Inspector's gated controls
  // (billing/04).
  app.use('*', async (c, next) => {
    const user = c.var.user;
    if (!user) return c.json({ error: 'Not signed in.' }, 401);

    const active = findActiveEntitlement(c.var.db, user.id, now());
    if (active?.plan !== 'premium') {
      return c.json(
        {
          error:
            'Export History is part of Premium — your exports are not kept.',
          code: 'premium_required',
        },
        403,
      );
    }
    return next();
  });

  app.get('/', (c) => {
    const user = c.var.user!;
    const entries = store
      .list(user.id, now())
      .map((row) => historyEntryView(row));
    return c.json({ entries });
  });

  app.get('/:id', (c) => {
    const user = c.var.user!;
    const id = Number(c.req.param('id'));
    if (!Number.isInteger(id) || id < 1) {
      return c.json({ error: 'Export not found.' }, 404);
    }
    try {
      // The ticket's "decrypt + stream": the ciphertext flows from disk
      // through the decipher to the response, never buffered whole (up to
      // 50 MB). content-length is the exact plaintext size (row.sizeBytes);
      // a GCM integrity failure truncates the stream mid-flight rather than
      // ever yielding a wrong file.
      const { stream, row } = store.stream({
        userId: user.id,
        id,
        now: now(),
      });
      return c.body(Readable.toWeb(stream) as ReadableStream<Uint8Array>, 200, {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${pdfFilename(row.name)}"`,
        'content-length': String(row.sizeBytes),
      });
    } catch (error) {
      if (error instanceof HistoryExpiredError) {
        return c.json(
          {
            error: 'This export has expired and been removed.',
            code: 'history_expired',
          },
          410,
        );
      }
      if (error instanceof HistoryNotFoundError) {
        return c.json({ error: 'Export not found.' }, 404);
      }
      throw error;
    }
  });

  return app;
}

/** The filename from the document name — header-safe (quoted string). */
function pdfFilename(name: string): string {
  const safe = name
    .replace(/[^\w. -]/g, '_')
    .replace(/^\.+/, '_')
    .trim();
  const base = safe || 'export';
  return base.endsWith('.pdf') ? base : `${base}.pdf`;
}
