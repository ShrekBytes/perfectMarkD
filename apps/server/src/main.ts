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
});

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`PerfectMarkD API listening on http://localhost:${info.port}`);
});
