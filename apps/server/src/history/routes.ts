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
import { eq } from 'drizzle-orm';
import type { AppEnv } from '../index.js';
import type { Clock } from '../auth/sessions.js';
import { entitlements } from '../db/schema.js';
import { isEntitlementActive } from '../quota.js';
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
  // inactive (isEntitlementActive), so expiry re-locks History the same way
  // it re-locks the Inspector's gated controls (billing/04).
  app.use('*', async (c, next) => {
    const user = c.var.user;
    if (!user) return c.json({ error: 'Not signed in.' }, 401);

    const row = c.var.db
      .select()
      .from(entitlements)
      .where(eq(entitlements.userId, user.id))
      .get();
    const active = isEntitlementActive(row ?? null, now()) ? row : null;
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
      const { bytes, row } = store.read({
        userId: user.id,
        id,
        now: now(),
      });
      return c.body(new Uint8Array(bytes), 200, {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${pdfFilename(row.name)}"`,
        'content-length': String(bytes.byteLength),
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
