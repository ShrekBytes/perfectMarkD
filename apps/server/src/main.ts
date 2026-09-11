import { serve } from '@hono/node-server';
import { createDatabase } from './db/database.js';
import { loadEnv } from './env.js';
import { createApp } from './index.js';

const env = loadEnv(process.env);
if (!env.sessionSecret) {
  throw new Error(
    'SESSION_SECRET is required — generate one with: openssl rand -hex 32',
  );
}
const db = createDatabase(env.dbPath);
const app = createApp({
  db,
  sessionSecret: env.sessionSecret,
  adminEmail: env.adminEmail,
  // Server Export (server/03): the in-process worker drives Chromium against
  // the app's /export route. In production the same origin serves the API and
  // the built SPA (server/06); in development point EXPORT_ORIGIN at the web
  // dev server (default http://localhost:5173).
  export: {
    origin: env.exportOrigin,
    concurrency: env.exportConcurrency,
    burstPerMinute: env.exportBurstPerMinute,
    renderTimeoutMs: env.exportRenderTimeoutMs,
  },
});

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`PerfectMarkD API listening on http://localhost:${info.port}`);
});
