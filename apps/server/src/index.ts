import { Hono } from 'hono';
import type { AppDatabase } from './db/database.js';
import { requestLogger, type LogSink } from './request-logger.js';

export interface AppEnv {
  Variables: { db: AppDatabase };
}

export interface CreateAppOptions {
  db: AppDatabase;
  /** Defaults to console (see requestLogger); tests capture via a custom sink. */
  log?: LogSink;
}

/**
 * The API application with fully typed routes. Request handlers reach the
 * database through `c.var.db`; every request is logged without payloads.
 */
export function createApp({ db, log }: CreateAppOptions) {
  return new Hono<AppEnv>()
    .use('*', requestLogger(log))
    .use('*', (c, next) => {
      c.set('db', db);
      return next();
    })
    .get('/healthz', (c) => c.json({ ok: true }));
}

/** Typed-routes handle for hono clients (RPC type inference). */
export type AppType = ReturnType<typeof createApp>;
