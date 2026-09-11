import { afterEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createApp, type AppType } from '../index.js';
import { createTestDatabase, removeTestDatabase } from '../db/testing.js';
import type { AppDatabase } from '../db/database.js';
import { entitlements, exportJobs, exportUsage, users } from '../db/schema.js';
import { LIMITS_KEY, setSetting } from '../db/settings.js';
import { usagePeriod } from '../quota.js';
import type { PlanLimits } from '../db/schema.js';
import type { RenderPdf } from './worker.js';
import { findExportJob } from './queue.js';

const SESSION_SECRET = 'test-session-secret';

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

/** The worker seam most tests use: every render resolves with a tiny
 *  "%P…" PDF as soon as it is claimed. */
function instantRenderer(pages = 2): RenderPdf {
  return async () => ({
    pdf: new Uint8Array([0x25, 0x50, 0x44, pages]),
    pages,
  });
}

function makeApp(
  options: {
    renderPdf?: RenderPdf;
    burstPerMinute?: number;
    withExport?: boolean;
  } = {},
): { app: AppType; db: AppDatabase } {
  const { db, dir } = createTestDatabase();
  cleanup = () => removeTestDatabase(dir);
  const app = createApp({
    db,
    log: () => {},
    sessionSecret: SESSION_SECRET,
    ...(options.withExport === false
      ? {}
      : {
          export: {
            origin: 'https://export.test',
            burstPerMinute: options.burstPerMinute ?? 5,
            renderPdf: options.renderPdf ?? instantRenderer(),
          },
        }),
  });
  return { app, db };
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

/** Registers through the real auth flow, returns the cookie. */
async function registerViaApi(app: AppType): Promise<string> {
  const res = await postJson(app, '/api/auth/register', {
    email: `u${Math.random().toString(36).slice(2)}@test.dev`,
    password: 'correct horse battery staple',
  });
  expect(res.status).toBe(201);
  return sessionCookie(res);
}

/** Grants an Entitlement directly (the Admin panel's DB effect). Returns the
 *  session cookie and the user id the grant landed on. */
async function grantEntitlement(
  app: AppType,
  db: AppDatabase,
  entitlement: { plan: 'pro' | 'premium'; expiresInDays?: number },
): Promise<{ cookie: string; userId: number }> {
  const cookie = await registerViaApi(app);
  const me = await app.request('/api/auth/me', { headers: { cookie } });
  const { user } = (await me.json()) as { user: { email: string } };
  const row = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, user.email))
    .get();
  const userId = row!.id;
  const expiresAt = new Date(
    Date.now() + (entitlement.expiresInDays ?? 30) * 24 * 60 * 60 * 1000,
  );
  db.insert(entitlements)
    .values({ userId, plan: entitlement.plan, expiresAt })
    .run();
  return { cookie, userId };
}

const BODY = { markdown: '# Hello\n\nWorld', pageCount: 1 };

async function waitForJob(
  db: AppDatabase,
  id: string,
): Promise<typeof exportJobs.$inferSelect> {
  for (let i = 0; i < 200; i++) {
    const job = findExportJob(db, id);
    if (job && (job.status === 'done' || job.status === 'failed')) return job;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('job never settled');
}

describe('POST /api/export', () => {
  it('requires a session', async () => {
    const { app } = makeApp();
    const res = await postJson(app, '/api/export', BODY);
    expect(res.status).toBe(401);
  });

  it('rejects users without an active entitlement (stub plan guard)', async () => {
    const { app } = makeApp();
    const cookie = await registerViaApi(app);
    const res = await postJson(app, '/api/export', BODY, { cookie });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'entitlement_required' });
  });

  it('rejects an expired entitlement', async () => {
    const { app, db } = makeApp();
    const { cookie } = await grantEntitlement(app, db, {
      plan: 'pro',
      expiresInDays: -1,
    });
    const res = await postJson(app, '/api/export', BODY, { cookie });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'entitlement_required' });
  });

  it('enqueues a job, renders it, and serves the PDF', async () => {
    const { app, db } = makeApp({ renderPdf: instantRenderer(4) });
    const { cookie } = await grantEntitlement(app, db, { plan: 'premium' });

    const res = await postJson(app, '/api/export', BODY, { cookie });
    expect(res.status).toBe(202);
    const { job } = (await res.json()) as {
      job: { id: string; status: string };
    };
    expect(job.status).toBe('queued');

    // Queue visible in DB (the plan snapshot is the part worth pinning; the
    // instant renderer may already have finished the row).
    const row = db
      .select()
      .from(exportJobs)
      .where(eq(exportJobs.id, job.id))
      .get();
    expect(row?.plan).toBe('premium');

    const settled = await waitForJob(db, job.id);
    expect(settled.status).toBe('done');
    expect(settled.pages).toBe(4);

    const status = await app.request(`/api/export/jobs/${job.id}`, {
      headers: { cookie },
    });
    expect(status.status).toBe(200);
    expect(await status.json()).toMatchObject({
      job: { id: job.id, status: 'done', pages: 4 },
    });

    const pdf = await app.request(`/api/export/jobs/${job.id}/pdf`, {
      headers: { cookie },
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get('content-type')).toBe('application/pdf');
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    expect(bytes[0]).toBe(0x25); // "%PDF"
  });

  it('hides other users’ jobs (404) on both job endpoints', async () => {
    const { app, db } = makeApp();
    const { cookie: owner } = await grantEntitlement(app, db, { plan: 'pro' });
    const res = await postJson(app, '/api/export', BODY, { cookie: owner });
    const { job } = (await res.json()) as { job: { id: string } };
    await waitForJob(db, job.id);

    const { cookie: other } = await grantEntitlement(app, db, { plan: 'pro' });
    expect(
      (
        await app.request(`/api/export/jobs/${job.id}`, {
          headers: { cookie: other },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await app.request(`/api/export/jobs/${job.id}/pdf`, {
          headers: { cookie: other },
        })
      ).status,
    ).toBe(404);
  });

  it('answers 409 when the PDF is requested before the job finishes', async () => {
    const pending: Array<(r: { pdf: Uint8Array; pages: number }) => void> = [];
    const { app, db } = makeApp({
      renderPdf: () =>
        new Promise((resolve) => {
          pending.push(resolve);
        }),
    });
    const { cookie } = await grantEntitlement(app, db, { plan: 'pro' });
    const res = await postJson(app, '/api/export', BODY, { cookie });
    const { job } = (await res.json()) as { job: { id: string } };

    const early = await app.request(`/api/export/jobs/${job.id}/pdf`, {
      headers: { cookie },
    });
    expect(early.status).toBe(409);

    pending[0]!({ pdf: new Uint8Array([1, 2, 3]), pages: 1 });
    await waitForJob(db, job.id);
  });

  it('rejects payloads that are malformed or over the plan page cap', async () => {
    const { app, db } = makeApp();
    const { cookie } = await grantEntitlement(app, db, { plan: 'pro' });

    const bad = await postJson(
      app,
      '/api/export',
      { markdown: '' },
      { cookie },
    );
    expect(bad.status).toBe(400);

    const overCap = await postJson(
      app,
      '/api/export',
      { ...BODY, pageCount: 301 }, // pro cap: 300
      { cookie },
    );
    expect(overCap.status).toBe(400);
    expect(((await overCap.json()) as { error: string }).error).toContain(
      'up to 300',
    );
  });

  it('enforces the per-minute burst limit', async () => {
    const { app, db } = makeApp({ burstPerMinute: 1 });
    const { cookie } = await grantEntitlement(app, db, { plan: 'pro' });

    const first = await postJson(app, '/api/export', BODY, { cookie });
    expect(first.status).toBe(202);
    const second = await postJson(app, '/api/export', BODY, { cookie });
    expect(second.status).toBe(429);
    expect(await second.json()).toMatchObject({ code: 'burst_limit' });
  });

  it('counts usage once per successful export', async () => {
    const { app, db } = makeApp();
    const { cookie, userId } = await grantEntitlement(app, db, { plan: 'pro' });
    const res = await postJson(app, '/api/export', BODY, { cookie });
    const { job } = (await res.json()) as { job: { id: string } };
    await waitForJob(db, job.id);

    expect(
      db.select().from(exportUsage).where(eq(exportUsage.userId, userId)).get()
        ?.count,
    ).toBe(1);
  });

  it('is not mounted when the export options are absent', async () => {
    const { app } = makeApp({ withExport: false });
    const res = await postJson(app, '/api/export', BODY);
    expect(res.status).toBe(404);
  });
});

describe('quota enforcement (server/04)', () => {
  /** Tight plan limits so a quota can be exhausted with one export. */
  function setQuota(db: AppDatabase, proQuota: number): void {
    const limits: PlanLimits = {
      pro: { pageCap: 300, quotaMonthly: proQuota },
      premium: { pageCap: 1000, quotaMonthly: 1000 },
    };
    setSetting(db, LIMITS_KEY, limits);
  }

  it('a successful export counts; the next one is a 402 with a typed code', async () => {
    const { app, db } = makeApp();
    setQuota(db, 1);
    const { cookie, userId } = await grantEntitlement(app, db, { plan: 'pro' });

    const first = await postJson(app, '/api/export', BODY, { cookie });
    expect(first.status).toBe(202);
    const { job } = (await first.json()) as { job: { id: string } };
    await waitForJob(db, job.id);

    const second = await postJson(app, '/api/export', BODY, { cookie });
    expect(second.status).toBe(402);
    expect(await second.json()).toMatchObject({ code: 'quota_exceeded' });

    // Rejected before enqueueing: only the one accepted job exists.
    const jobs = db
      .select()
      .from(exportJobs)
      .where(eq(exportJobs.userId, userId))
      .all();
    expect(jobs).toHaveLength(1);
  });

  it('failed renders never consume quota', async () => {
    const { app, db } = makeApp({
      renderPdf: async () => {
        throw new Error('render exploded');
      },
    });
    setQuota(db, 1);
    const { cookie } = await grantEntitlement(app, db, { plan: 'pro' });

    const first = await postJson(app, '/api/export', BODY, { cookie });
    const { job } = (await first.json()) as { job: { id: string } };
    await waitForJob(db, job.id);

    const second = await postJson(app, '/api/export', BODY, { cookie });
    expect(second.status).toBe(202);
  });

  it('comps raise the ceiling for the period', async () => {
    const { app, db } = makeApp();
    setQuota(db, 1);
    const { cookie, userId } = await grantEntitlement(app, db, { plan: 'pro' });

    const first = await postJson(app, '/api/export', BODY, { cookie });
    const { job } = (await first.json()) as { job: { id: string } };
    await waitForJob(db, job.id);
    expect((await postJson(app, '/api/export', BODY, { cookie })).status).toBe(
      402,
    );

    // The Admin comps one extra export (billing/03's DB effect).
    const period = usagePeriod(new Date());
    db.update(exportUsage)
      .set({ comps: 1 })
      .where(
        and(eq(exportUsage.userId, userId), eq(exportUsage.period, period)),
      )
      .run();

    expect((await postJson(app, '/api/export', BODY, { cookie })).status).toBe(
      202,
    );
  });

  it('last period’s usage does not count against this period', async () => {
    const { app, db } = makeApp();
    setQuota(db, 1);
    const { cookie, userId } = await grantEntitlement(app, db, { plan: 'pro' });

    const lastMonth = new Date();
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    db.insert(exportUsage)
      .values({ userId, period: usagePeriod(lastMonth), count: 1 })
      .run();

    const res = await postJson(app, '/api/export', BODY, { cookie });
    expect(res.status).toBe(202);
  });

  it('quota rejections do not consume burst slots', async () => {
    const { app, db } = makeApp({ burstPerMinute: 2 });
    setQuota(db, 1);
    const { cookie } = await grantEntitlement(app, db, { plan: 'pro' });

    // One accepted export (burst slot 1) plus quota exhaustion; the burst
    // window holds 2, so a third 402 would be a 429 if rejections consumed
    // slots. They must not.
    const first = await postJson(app, '/api/export', BODY, { cookie });
    const { job } = (await first.json()) as { job: { id: string } };
    await waitForJob(db, job.id);

    for (let i = 0; i < 3; i++) {
      const res = await postJson(app, '/api/export', BODY, { cookie });
      expect(res.status).toBe(402);
    }
  });

  it('a comped user without a plan spends their comps, then needs a plan', async () => {
    const { app, db } = makeApp();
    setQuota(db, 1);
    const { cookie, userId } = await grantEntitlement(app, db, { plan: 'pro' });
    // Revoke the Entitlement: comps survive, the plan quota does not
    // (billing/03: comping grants exports without a plan).
    db.delete(entitlements).where(eq(entitlements.userId, userId)).run();
    db.insert(exportUsage)
      .values({ userId, period: usagePeriod(new Date()), count: 0, comps: 1 })
      .run();

    const first = await postJson(app, '/api/export', BODY, { cookie });
    expect(first.status).toBe(202);
    const { job } = (await first.json()) as { job: { id: string } };
    const settled = await waitForJob(db, job.id);
    expect(settled.status).toBe('done');
    expect(settled.plan).toBe('free');

    // Comps exhausted with no plan behind them → the 403, not the 402.
    const second = await postJson(app, '/api/export', BODY, { cookie });
    expect(second.status).toBe(403);
    expect(await second.json()).toMatchObject({ code: 'entitlement_required' });
  });

  it('an expired entitlement with comps left can still spend them', async () => {
    const { app, db } = makeApp();
    setQuota(db, 1);
    const { cookie, userId } = await grantEntitlement(app, db, {
      plan: 'pro',
      expiresInDays: -1,
    });
    db.insert(exportUsage)
      .values({ userId, period: usagePeriod(new Date()), count: 0, comps: 1 })
      .run();

    const res = await postJson(app, '/api/export', BODY, { cookie });
    expect(res.status).toBe(202);
  });

  it('a planless comped user gets the smallest page cap', async () => {
    const { app, db } = makeApp();
    const { cookie, userId } = await grantEntitlement(app, db, { plan: 'pro' });
    db.delete(entitlements).where(eq(entitlements.userId, userId)).run();
    db.insert(exportUsage)
      .values({ userId, period: usagePeriod(new Date()), count: 0, comps: 5 })
      .run();

    // Pro's cap is 300; the planless user must not exceed the smallest cap.
    const over = await postJson(
      app,
      '/api/export',
      { ...BODY, pageCount: 301 },
      { cookie },
    );
    expect(over.status).toBe(400);
    expect(((await over.json()) as { error: string }).error).toContain(
      'up to 300',
    );

    const ok = await postJson(
      app,
      '/api/export',
      { ...BODY, pageCount: 300 },
      { cookie },
    );
    expect(ok.status).toBe(202);
  });
});
