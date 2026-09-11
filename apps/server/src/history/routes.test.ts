import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { eq, sql } from 'drizzle-orm';
import { createApp, type AppType } from '../index.js';
import { createTestDatabase, removeTestDatabase } from '../db/testing.js';
import type { AppDatabase } from '../db/database.js';
import { entitlements, users } from '../db/schema.js';
import { findExportJob } from '../export/queue.js';
import type { RenderPdf } from '../export/worker.js';
import type { ExportHistoryRow } from './store.js';
import { createHistoryStore } from './store.js';

const SESSION_SECRET = 'test-session-secret';
const MASTER_KEY = 'a'.repeat(64);

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

/** The worker seam: every render resolves with a tiny "%P…" PDF. */
function instantRenderer(): RenderPdf {
  return async () => ({
    pdf: new Uint8Array([0x25, 0x50, 0x44, 0x2d, 9, 9, 9, 9]),
    pages: 2,
  });
}

function makeApp(
  options: { renderPdf?: RenderPdf; withHistory?: boolean } = {},
): {
  app: AppType;
  db: AppDatabase;
  history: ReturnType<typeof createHistoryStore>;
} {
  const { db, dir } = createTestDatabase();
  const historyDir = mkdtempSync(join(tmpdir(), 'pmd-history-'));
  cleanup = () => {
    removeTestDatabase(dir);
    rmSync(historyDir, { recursive: true, force: true });
  };
  const history = createHistoryStore({
    db,
    dir: historyDir,
    masterKey: MASTER_KEY,
  });
  const app = createApp({
    db,
    log: () => {},
    sessionSecret: SESSION_SECRET,
    ...(options.withHistory === false ? {} : { history }),
    export: {
      origin: 'https://export.test',
      renderPdf: options.renderPdf ?? instantRenderer(),
    },
  });
  return { app, db, history };
}

function postJson(
  app: AppType,
  path: string,
  body: unknown,
  options: { cookie?: string } = {},
) {
  return app.request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function sessionCookie(res: Response): string {
  const header = res.headers.get('set-cookie');
  if (!header) throw new Error('no set-cookie header');
  return header.split(';')[0]!;
}

async function registerViaApi(app: AppType): Promise<string> {
  const res = await postJson(app, '/api/auth/register', {
    email: `u${Math.random().toString(36).slice(2)}@test.dev`,
    password: 'correct horse battery staple',
  });
  expect(res.status).toBe(201);
  return sessionCookie(res);
}

/** Grants an Entitlement directly (the Admin panel's DB effect). */
async function grantEntitlement(
  app: AppType,
  db: AppDatabase,
  plan: 'pro' | 'premium',
  expiresInDays = 30,
): Promise<{ cookie: string; userId: number }> {
  const cookie = await registerViaApi(app);
  const me = await app.request('/api/auth/me', { headers: { cookie } });
  const { user } = (await me.json()) as { user: { email: string } };
  const userId = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, user.email))
    .get()!.id;
  const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000);
  db.insert(entitlements).values({ userId, plan, expiresAt }).run();
  return { cookie, userId };
}

async function waitForJob(db: AppDatabase, id: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const job = findExportJob(db, id);
    if (job && (job.status === 'done' || job.status === 'failed')) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('job never settled');
}

const EXPORT_BODY = {
  title: 'Quarterly Report',
  markdown: '# Hi',
  pageCount: 1,
};

/** Runs a real export through the in-process worker and returns its row. */
async function exportViaApi(
  app: AppType,
  db: AppDatabase,
  cookie: string,
): Promise<void> {
  const res = await postJson(app, '/api/export', EXPORT_BODY, { cookie });
  expect(res.status).toBe(202);
  const { job } = (await res.json()) as { job: { id: string } };
  await waitForJob(db, job.id);
}

describe('GET /api/history', () => {
  it('requires a session', async () => {
    const { app } = makeApp();
    const res = await app.request('/api/history');
    expect(res.status).toBe(401);
  });

  it('rejects a signed-in user without an active entitlement', async () => {
    const { app } = makeApp();
    const cookie = await registerViaApi(app);
    const res = await app.request('/api/history', { headers: { cookie } });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'premium_required' });
  });

  it('rejects Pro — History is Premium-only', async () => {
    const { app, db } = makeApp();
    const { cookie } = await grantEntitlement(app, db, 'pro');
    const res = await app.request('/api/history', { headers: { cookie } });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'premium_required' });
  });

  it('rejects an expired Premium entitlement', async () => {
    const { app, db } = makeApp();
    const { cookie } = await grantEntitlement(app, db, 'premium', -1);
    const res = await app.request('/api/history', { headers: { cookie } });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'premium_required' });
  });

  it('round-trips a Premium export: stored by the worker, listed, downloaded', async () => {
    const { app, db } = makeApp();
    const { cookie } = await grantEntitlement(app, db, 'premium');
    await exportViaApi(app, db, cookie);

    const list = await app.request('/api/history', { headers: { cookie } });
    expect(list.status).toBe(200);
    const { entries } = (await list.json()) as { entries: ExportHistoryRow[] };
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: 'Quarterly Report',
      pages: 2,
      sizeBytes: 8,
    });
    expect(entries[0]!.createdAt).toBeTruthy();
    expect(entries[0]!.expiresAt).toBeTruthy();

    const download = await app.request(`/api/history/${entries[0]!.id}`, {
      headers: { cookie },
    });
    expect(download.status).toBe(200);
    expect(download.headers.get('content-type')).toBe('application/pdf');
    const bytes = new Uint8Array(await download.arrayBuffer());
    expect(bytes).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x2d, 9, 9, 9, 9]));
  });

  it('does not store Pro exports (the API itself is Premium-only)', async () => {
    const { app, db } = makeApp();
    const { cookie } = await grantEntitlement(app, db, 'pro');
    await exportViaApi(app, db, cookie);

    // The Pro user's list request is rejected by the Premium gate…
    const list = await app.request('/api/history', { headers: { cookie } });
    expect(list.status).toBe(403);
    // …and nothing was stored by the worker either.
    const rows = db.all<{ count: number }>(
      sql`select count(*) as count from exports_history`,
    );
    expect(rows[0]!.count).toBe(0);
  });

  it('hides another user’s entries entirely (404, not 403)', async () => {
    const { app, db, history } = makeApp();
    const owner = await grantEntitlement(app, db, 'premium');
    await exportViaApi(app, db, owner.cookie);
    const [entry] = history.list(owner.userId, new Date());

    const other = await grantEntitlement(app, db, 'premium');
    const list = await app.request('/api/history', {
      headers: { cookie: other.cookie },
    });
    const { entries } = (await list.json()) as { entries: unknown[] };
    expect(entries).toEqual([]);

    const download = await app.request(`/api/history/${entry!.id}`, {
      headers: { cookie: other.cookie },
    });
    expect(download.status).toBe(404);
  });

  it('hides expired entries from the list and answers 410 on download', async () => {
    const { app, db, history } = makeApp();
    const { cookie, userId } = await grantEntitlement(app, db, 'premium');
    // Stored 31 days ago: expired, not yet purged.
    history.store({
      userId,
      name: 'Ancient',
      pages: 1,
      pdf: new Uint8Array([1, 2, 3]),
      now: new Date(Date.now() - 31 * 86_400_000),
    });

    const list = await app.request('/api/history', { headers: { cookie } });
    const { entries } = (await list.json()) as { entries: unknown[] };
    expect(entries).toEqual([]);

    const row = db.all<{ id: number }>(sql`select id from exports_history`)[0]!;
    const download = await app.request(`/api/history/${row.id}`, {
      headers: { cookie },
    });
    expect(download.status).toBe(410);
    expect(await download.json()).toMatchObject({ code: 'history_expired' });
  });

  it('answers 404 for an unknown entry', async () => {
    const { app, db } = makeApp();
    const { cookie } = await grantEntitlement(app, db, 'premium');
    const res = await app.request('/api/history/999', { headers: { cookie } });
    expect(res.status).toBe(404);
  });

  it('is not mounted unless the app is configured with history', async () => {
    const { app, db } = makeApp({ withHistory: false });
    const { cookie } = await grantEntitlement(app, db, 'premium');
    const res = await app.request('/api/history', { headers: { cookie } });
    expect(res.status).toBe(404);
  });
});
