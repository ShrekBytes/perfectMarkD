import { Hono } from 'hono';
import { getSignedCookie } from 'hono/cookie';
import { buildInfo } from '@perfectmarkd/core';
import type { AppDatabase } from './db/database.js';
import type { User } from './db/schema.js';
import { requestLogger, type LogSink } from './request-logger.js';
import { authRoutes, type AuthOptions } from './auth/routes.js';
import { orderRoutes } from './orders/routes.js';
import { pricingRoutes } from './pricing/routes.js';
import { adminRoutes } from './admin/routes.js';
import { setSessionCookie } from './auth/http.js';
import { createSendLimiter } from './auth/rate-limit.js';
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
import { resolveAiContext, type AiAppOptions } from './ai/context.js';
import { aiRoutes } from './ai/routes.js';
import type { Mailer } from './mail/mailer.js';
import { googleRoutes } from './google/routes.js';
import type { GoogleSignIn } from './google/exchange.js';

export interface AppEnv {
  Variables: {
    db: AppDatabase;
    user: User | null;
    /** Raw session token from a verified cookie; null when absent. */
    sessionToken: string | null;
    /**
     * The Mailer (ADR-0013), resolved once at the composition root. There is no
     * "no mailer" composition: sign-in is blocked until an address is verified,
     * and the boot gate refuses to start an API that cannot send.
     */
    mailer: Mailer;
  };
}

/** Everything the Server Export pipeline (server/03) needs at boot. When
 *  omitted, the export API is not mounted at all. */
interface ExportAppOptions {
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

interface CreateAppOptions {
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
  /**
   * The AI provider seam (ADR-0008): the deployment's key from the
   * environment, and the client to call it with. Omitted entirely means the
   * instance has no key, so AI reports as unconfigured; tests inject a fake
   * provider so nothing here touches a live API.
   */
  ai?: AiAppOptions;
  /**
   * The Mailer (ADR-0013), injected at the composition root beside the session
   * secret and the clock: production passes the provider client, tests a fake
   * that records sends. Required — a registration that cannot mail a
   * verification link creates an account nobody can ever sign into.
   */
  mail: Mailer;
  /**
   * PUBLIC_ORIGIN: the address users reach this instance on, and the only thing
   * the one-time links in those emails are built from. Required for the same
   * reason as the Mailer, and never taken from a request: `Host` is
   * attacker-supplied, and a link we send to their page from our domain
   * carries our DKIM signature.
   */
  publicOrigin: string;
  /**
   * Google Sign-In (google-signin/01): the deployment's OAuth client. Absent
   * (either half of the pair) means the feature is absent — the routes are not
   * mounted and the SPA renders no button. Unlike the mailer, this is not a boot
   * gate: a deployment without Google Sign-In is complete, not degraded.
   */
  google?: GoogleSignIn | null;
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
  ai: aiOptions,
  mail,
  publicOrigin,
  google,
}: CreateAppOptions) {
  const clock: Clock = now ?? (() => new Date());
  // One send budget for the whole instance, built here and handed to every route
  // that can mail a user. It lives at the composition root rather than inside
  // one router because "one budget for all of them" (spec §Rate limits) is a
  // fact about the wiring: registration, the resends, the reset requests, the
  // email changes, and the admin panel's two all draw on these counters, so a
  // flood started from any of them is bounded once.
  const sendLimiter = createSendLimiter(authRateLimit);
  // The AI context is resolved once: the environment key plus the provider
  // seam. With no key the context is inert — AI reports as unconfigured and
  // no surface can reach a provider.
  const ai = resolveAiContext(aiOptions);

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
      c.set('mailer', mail);
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
    // The build identity rides along on the health probe: when a bug report
    // says "the export came out wrong", the first question is which build, and
    // `ok` alone cannot answer it. Compose's healthcheck only reads `ok`, so
    // this stays compatible with it.
    .get('/healthz', (c) => c.json({ ok: true, ...buildInfo(process.env) }))
    .route('/api/me', meRoutes({ now: clock, ai }))
    .route(
      '/api/auth',
      authRoutes({
        sessionSecret,
        adminEmail,
        publicOrigin,
        authRateLimit,
        sendLimiter,
        googleSignIn: Boolean(google),
        now: clock,
        log,
      }),
    )
    .route('/api/orders', orderRoutes({ now: clock }))
    // The public catalog read (live-pricing/01): prices and limits only, with
    // no session. Mounted unconditionally — it is how a prospective customer
    // reads the pricing page at all.
    .route('/api/pricing', pricingRoutes())
    .route(
      '/api/admin',
      adminRoutes({
        now: clock,
        publicOrigin,
        sendLimiter,
        removeStoredFile,
        ai,
      }),
    )
    // AI Actions (ai-transforms/05): always mounted so the AI Access switch
    // and typed gate refusals work even on an instance with no key. The
    // commands themselves are hidden client-side when unconfigured.
    .route('/api/ai', aiRoutes({ ai, now: clock, log }));

  // Google Sign-In (google-signin/01): mounted only when the deployment
  // configured an OAuth client. Unconfigured, the routes do not exist at all —
  // an absent feature, not a broken one — and /api/auth/providers reports it
  // off, which is what keeps the SPA's button off the page.
  //
  // The flow is mounted at the app's root rather than under /api because the
  // redirect URI is registered with the OAuth client, and the operator
  // registers the address a person actually comes back to. Same origin either
  // way in production (Caddy serves the SPA and the API from one hostname);
  // the proxy passes /auth/google through to the API.
  const withGoogle = google
    ? app.route(
        '/auth/google',
        googleRoutes({
          google,
          publicOrigin,
          sessionSecret,
          adminEmail,
          authRateLimit,
          now: clock,
          log,
        }),
      )
    : app;

  // Export History (server/05) mounts whenever storage is configured; the
  // Server Export API additionally needs its worker options. A composition
  // without history (some tests) simply has no /api/history routes.
  const withHistory = history
    ? withGoogle.route(
        '/api/history',
        historyRoutes({ store: history, now: clock }),
      )
    : withGoogle;

  return exportApp ? withHistory.route('/api/export', exportApp) : withHistory;
}

/** The composed app's type — what the test suites drive requests against. */
export type AppType = ReturnType<typeof createApp>;
