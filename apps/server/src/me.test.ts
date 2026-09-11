import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp, type AppType } from './index.js';
import { createTestDatabase, removeTestDatabase } from './db/testing.js';
import type { AppDatabase } from './db/database.js';
import { entitlements, exportUsage, users } from './db/schema.js';
import { usagePeriod } from './quota.js';

const SESSION_SECRET = 'test-session-secret';

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function makeApp(options: { adminEmail?: string } = {}): {
  app: AppType;
  db: AppDatabase;
} {
  const { db, dir } = createTestDatabase();
  cleanup = () => removeTestDatabase(dir);
  const app = createApp({
    db,
    log: () => {},
    sessionSecret: SESSION_SECRET,
    adminEmail: options.adminEmail ?? null,
  });
  return { app, db };
}

function postJson(app: AppType, path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function sessionCookie(res: Response): string {
  const header = res.headers.get('set-cookie');
  if (!header) throw new Error('no set-cookie header');
  return header.split(';')[0]!;
}

async function registerViaApi(
  app: AppType,
  email = `u${Math.random().toString(36).slice(2)}@test.dev`,
): Promise<string> {
  const res = await postJson(app, '/api/auth/register', {
    email,
    password: 'correct horse battery staple',
  });
  expect(res.status).toBe(201);
  return sessionCookie(res);
}

function grant(
  db: AppDatabase,
  email: string,
  plan: 'pro' | 'premium',
  expiresInDays: number,
): void {
  const userId = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .get()!.id;
  db.insert(entitlements)
    .values({
      userId,
      plan,
      expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
    })
    .run();
}

interface MeResponse {
  email: string;
  isAdmin: boolean;
  plan: string | null;
  expiresAt: string | null;
  quota: { used: number; limit: number };
}

async function getMe(app: AppType, cookie?: string): Promise<Response> {
  return app.request('/api/me', {
    headers: cookie ? { cookie } : {},
  });
}

describe('GET /api/me', () => {
  it('answers 401 when signed out', async () => {
    const { app } = makeApp();
    const res = await getMe(app);
    expect(res.status).toBe(401);
  });

  it('a fresh free user has no plan and a zero quota', async () => {
    const { app } = makeApp();
    const cookie = await registerViaApi(app);

    const res = await getMe(app, cookie);
    expect(res.status).toBe(200);
    const me = (await res.json()) as MeResponse;
    expect(me).toEqual({
      email: expect.any(String),
      isAdmin: false,
      plan: null,
      expiresAt: null,
      quota: { used: 0, limit: 0 },
    });
  });

  it('an active Entitlement shows the plan, expiry, and plan quota', async () => {
    const { app, db } = makeApp();
    const email = `u${Math.random().toString(36).slice(2)}@test.dev`;
    const cookie = await registerViaApi(app, email);
    grant(db, email, 'pro', 30);

    const me = (await (await getMe(app, cookie)).json()) as MeResponse;
    expect(me.plan).toBe('pro');
    expect(me.expiresAt).toEqual(expect.any(String));
    expect(me.quota).toEqual({ used: 0, limit: 300 });
  });

  it('an expired Entitlement re-locks: no plan, no plan quota', async () => {
    const { app, db } = makeApp();
    const email = `u${Math.random().toString(36).slice(2)}@test.dev`;
    const cookie = await registerViaApi(app, email);
    grant(db, email, 'premium', -1);

    const me = (await (await getMe(app, cookie)).json()) as MeResponse;
    expect(me.plan).toBeNull();
    expect(me.expiresAt).toBeNull();
    expect(me.quota).toEqual({ used: 0, limit: 0 });
  });

  it('reports the period usage and includes comps in the limit', async () => {
    const { app, db } = makeApp();
    const email = `u${Math.random().toString(36).slice(2)}@test.dev`;
    const cookie = await registerViaApi(app, email);
    grant(db, email, 'pro', 30);
    const userId = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .get()!.id;
    db.insert(exportUsage)
      .values({ userId, period: usagePeriod(new Date()), count: 7, comps: 5 })
      .run();

    const me = (await (await getMe(app, cookie)).json()) as MeResponse;
    expect(me.quota).toEqual({ used: 7, limit: 305 });
  });

  it("last period's usage does not carry into the limit or used", async () => {
    const { app, db } = makeApp();
    const email = `u${Math.random().toString(36).slice(2)}@test.dev`;
    const cookie = await registerViaApi(app, email);
    grant(db, email, 'pro', 30);
    const userId = db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .get()!.id;
    const lastMonth = new Date();
    lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
    db.insert(exportUsage)
      .values({
        userId,
        period: usagePeriod(lastMonth),
        count: 299,
        comps: 40,
      })
      .run();

    const me = (await (await getMe(app, cookie)).json()) as MeResponse;
    expect(me.quota).toEqual({ used: 0, limit: 300 });
  });

  it('flags the admin account', async () => {
    const { app } = makeApp({ adminEmail: 'boss@test.dev' });
    const cookie = await registerViaApi(app, 'boss@test.dev');

    const me = (await (await getMe(app, cookie)).json()) as MeResponse;
    expect(me.isAdmin).toBe(true);
  });
});
