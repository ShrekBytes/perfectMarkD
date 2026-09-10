import { Hono } from 'hono';
import { getSignedCookie } from 'hono/cookie';
import type { AppDatabase } from './db/database.js';
import type { User } from './db/schema.js';
import { requestLogger, type LogSink } from './request-logger.js';
import { authRoutes, type AuthOptions } from './auth/routes.js';
import { setSessionCookie } from './auth/http.js';
import {
  SESSION_COOKIE,
  userForSessionToken,
  type Clock,
} from './auth/sessions.js';

export interface AppEnv {
  Variables: {
    db: AppDatabase;
    user: User | null;
    /** Raw session token from a verified cookie; null when absent. */
    sessionToken: string | null;
  };
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
}: CreateAppOptions) {
  const clock: Clock = now ?? (() => new Date());
  return new Hono<AppEnv>()
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
    .route(
      '/api/auth',
      authRoutes({ sessionSecret, adminEmail, authRateLimit, now: clock }),
    );
}

/** Typed-routes handle for hono clients (RPC type inference). */
export type AppType = ReturnType<typeof createApp>;
