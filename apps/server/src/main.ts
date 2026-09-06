import { serve } from '@hono/node-server';
import { createDatabase } from './db/database.js';
import { loadEnv } from './env.js';
import { createApp } from './index.js';

const env = loadEnv(process.env);
const db = createDatabase(env.dbPath);
const app = createApp({ db });

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`PerfectMarkD API listening on http://localhost:${info.port}`);
});
