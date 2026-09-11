import { serve } from '@hono/node-server';
import { createDatabase } from './db/database.js';
import { loadEnv } from './env.js';
import { createApp } from './index.js';
import { createHistoryStore } from './history/store.js';
import { startHistoryPurge } from './history/purge.js';

const env = loadEnv(process.env);
if (!env.sessionSecret) {
  throw new Error(
    'SESSION_SECRET is required — generate one with: openssl rand -hex 32',
  );
}
if (!env.historyEncryptionKey) {
  throw new Error(
    'HISTORY_ENCRYPTION_KEY is required — Premium Server Exports must land in Export History. Generate one with: openssl rand -hex 32',
  );
}
const db = createDatabase(env.dbPath);
// Export History storage (server/05): finished Premium exports, encrypted at
// rest, live here. parseMasterKey rejects malformed key material — a bad key
// fails the boot above the first request, not mid-deployment.
const history = createHistoryStore({
  db,
  dir: env.historyDir,
  masterKey: env.historyEncryptionKey,
});
const stopHistoryPurge = startHistoryPurge({ db, store: history });
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
  history,
});

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`PerfectMarkD API listening on http://localhost:${info.port}`);
});

// Graceful shutdown: release the purge timer. The worker's in-flight renders
// settle on their own; the container runtime's stop timeout covers them.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    stopHistoryPurge();
    process.exit(0);
  });
}
