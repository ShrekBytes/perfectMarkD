import { serve } from '@hono/node-server';
import { createDatabase } from './db/database.js';
import { loadEnv } from './env.js';
import { createApp } from './index.js';
import { createHistoryStore } from './history/store.js';
import { startHistoryPurge } from './history/purge.js';
import { resolveMail, requirePublicOrigin } from './mail/config.js';

const env = loadEnv(process.env);
if (!env.sessionSecret) {
  throw new Error(
    'SESSION_SECRET is required — generate one with: openssl rand -hex 32',
  );
}
if (!env.historyEncryptionKey) {
  throw new Error(
    'HISTORY_ENCRYPTION_KEY is required — Server Exports by Premium users must land in Export History. Generate one with: openssl rand -hex 32',
  );
}
// Transactional email (email/01, ADR-0013): the third boot gate, and the one
// that fails first when a deployment has never sent a message. Sign-in is
// blocked until an address is verified, so an instance that cannot send email
// is an instance nobody can get into. MAIL_MODE=console is the local escape.
const mail = resolveMail({
  apiKey: env.resendApiKey,
  from: env.mailFrom,
  mode: env.mailMode,
});
// The fourth boot gate (email/02), beside the other three: the one-time links
// in transactional email are absolute, and only the deployment knows the address
// a user's browser reaches the instance on. A missing value cannot reach a
// user — it would put a dead link in a real inbox — so it stops the boot.
const publicOrigin = requirePublicOrigin(env.publicOrigin);
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
  // AI (ai-transforms/03): the provider key is environment configuration
  // only (ADR-0008); absent means the instance reports AI as unconfigured.
  ai: { apiKey: env.aiApiKey },
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
  mail,
  // The one-time links in transactional email are absolute (email/02): the
  // verification email a new account waits on, and the resend that replaces a
  // lost one.
  publicOrigin,
});

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`PerfectMarkD API listening on http://localhost:${info.port}`);
});

// Graceful shutdown: release the purge timer. In-flight Server Export
// renders are abandoned at exit — the container runtime's stop timeout is
// what bounds how long they can delay shutdown.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    stopHistoryPurge();
    process.exit(0);
  });
}
