import { Hono } from 'hono';
import { getSignedCookie } from 'hono/cookie';
import type { AppDatabase } from './db/database.js';
import type { User } from './db/schema.js';
import { requestLogger, type LogSink } from './request-logger.js';
import { authRoutes, type AuthOptions } from './auth/routes.js';
import { orderRoutes } from './orders/routes.js';
import { adminRoutes } from './admin/routes.js';
import { setSessionCookie } from './auth/http.js';
import {
  SESSION_COOKIE,
  userForSessionToken,
  type Clock,
} from './auth/sessions.js';
import { PayloadStore, ResultStore } from './export/queue.js';
import { exportRoutes } from './export/routes.js';
import { createPlaywrightRenderer } from './export/render.js';
import { ExportWorker, type RenderPdf } from './export/worker.js';
import { historyRoutes } from './history/routes.js';
import type { HistoryStore } from './history/store.js';
import { meRoutes } from './me.js';

export interface AppEnv {
  Variables: {
    db: AppDatabase;
    user: User | null;
    /** Raw session token from a verified cookie; null when absent. */
    sessionToken: string | null;
  };
}

/** Everything the Server Export pipeline (server/03) needs at boot. When
 *  omitted, the export API is not mounted at all. */
export interface ExportAppOptions {
  /** Origin the worker loads the app's /export route from (ADR-0003) —
   *  the web dev server in development, the same origin in production. */
  origin: string;
  /** Simultaneous renders (default 2, the ticket's number). */
  concurrency?: number;
  /** Max enqueues per user per rolling minute (default 10). */
  burstPerMinute?: number;
  /** Per-render deadline before the job fails as render_timeout. */
  renderTimeoutMs?: number;
  /**
   * The render seam. Default: the real Chromium renderer (render.ts), built
   * lazily so importing playwright never happens at app construction. Tests
   * inject fakes here.
   */
  renderPdf?: RenderPdf;
}

export interface CreateAppOptions {
  db: AppDatabase;
  /** Signs session cookies; required once auth is mounted (server/02). */
  sessionSecret: string;
  /** First registered account with this email becomes the Admin. */
  adminEmail?: string | null;
  /** Per-route auth rate-limit overrides (tests tighten these). */
  authRateLimit?: AuthOptions['authRateLimit'];
  /** Injectable clock (tests control session expiry). */
  now?: Clock;
  /** Defaults to console (see requestLogger); tests capture via a custom sink. */
  log?: LogSink;
  /**
   * Removes an Export History file on account deletion (billing/03); tests
   * inject a recorder. Default: best-effort unlink of absolute paths.
   */
  removeStoredFile?: (storedPath: string) => void;
  /**
   * Export History storage (server/05). When provided, finished Server
   * Exports by Premium users are copied to encrypted disk under it,
   * `/api/history` is mounted, and the composition root (main.ts) owns the
   * daily purge. Omitted: the routes don't exist and exports are
   * memory-only (server/03 behavior).
   */
  history?: HistoryStore;
  /** Mounts the Server Export API + in-process worker (server/03). */
  export?: ExportAppOptions;
}

/**
 * The API application with fully typed routes. Request handlers reach the
 * database through `c.var.db`; every request is logged without payloads.
 */
export function createApp({
  db,
  sessionSecret,
  adminEmail = null,
  authRateLimit,
  now,
  log,
  removeStoredFile,
  history,
  export: exportOptions,
}: CreateAppOptions) {
  const clock: Clock = now ?? (() => new Date());

  // The Server Export pipeline (server/03): memory stores, the in-process
  // worker, and the /api/export routes. The worker's boot (stale-job
  // recovery + first pump) runs at creation so a restarted process picks
  // work up immediately.
  let exportApp: ReturnType<typeof exportRoutes> | null = null;
  if (exportOptions) {
    const payloads = new PayloadStore();
    const results = new ResultStore();
    const renderer = exportOptions.renderPdf
      ? { renderPdf: exportOptions.renderPdf, close: async () => {} }
      : createPlaywrightRenderer({
          origin: exportOptions.origin,
          timeoutMs: exportOptions.renderTimeoutMs,
        });
    const worker = new ExportWorker({
      db,
      payloads,
      results,
      renderPdf: renderer.renderPdf,
      concurrency: exportOptions.concurrency,
      history,
      clock,
      log,
    });
    worker.start();
    exportApp = exportRoutes({
      db,
      payloads,
      results,
      worker,
      burstPerMinute: exportOptions.burstPerMinute ?? 10,
      now: clock,
    });
  }

  const app = new Hono<AppEnv>()
    .use('*', requestLogger(log))
    .use('*', async (c, next) => {
      c.set('db', db);
      // Resolve the session once per request; `me` and future gated routes
      // read the result rather than re-querying. The cookie is signed, so an
      // invalid signature (false) counts as no session.
      const token = await getSignedCookie(c, sessionSecret, SESSION_COOKIE);
      c.set('sessionToken', token ? token : null);
      const session = token ? userForSessionToken(db, token, clock()) : null;
      c.set('user', session?.user ?? null);
      // Rolling cookie: when the stored expiry was extended, refresh the
      // browser's copy too — otherwise the browser drops it at day 30 even
      // though the database session is still alive.
      if (session?.rolled && token) {
        await setSessionCookie(c, sessionSecret, token);
      }
      return next();
    })
    .get('/healthz', (c) => c.json({ ok: true }))
    .route('/api/me', meRoutes({ now: clock }))
    .route(
      '/api/auth',
      authRoutes({ sessionSecret, adminEmail, authRateLimit, now: clock }),
    )
    .route('/api/orders', orderRoutes())
    .route('/api/admin', adminRoutes({ now: clock, removeStoredFile }));

  // Export History (server/05) mounts whenever storage is configured; the
  // Server Export API additionally needs its worker options. A composition
  // without history (some tests) simply has no /api/history routes.
  const withHistory = history
    ? app.route('/api/history', historyRoutes({ store: history, now: clock }))
    : app;

  return exportApp ? withHistory.route('/api/export', exportApp) : withHistory;
}

/** Typed-routes handle for hono clients (RPC type inference). */
export type AppType = ReturnType<typeof createApp>;
