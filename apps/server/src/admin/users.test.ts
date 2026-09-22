import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp, type AppType } from '../index.js';
import { createTestDatabase, removeTestDatabase } from '../db/testing.js';
import type { AppDatabase } from '../db/database.js';
import { LTC_RATE_KEY, WALLETS_KEY, setSetting } from '../db/settings.js';
import {
  aiUsage,
  entitlements,
  exportUsage,
  exportsHistory,
  orders,
  sessions,
  users,
} from '../db/schema.js';

const SESSION_SECRET = 'test-session-secret';

const WALLETS = {
  'USDT-TRC20': 'TTronWalletAddressForTests1234',
  'USDT-BEP20': '0xBep20WalletAddressForTests000001',
  LTC: 'ltc1qTestWalletAddressForTests00000',
};

/** Fixed clock so stacking, periods, and audit rows hit known literals. */
const NOW = new Date('2026-09-11T00:00:00.000Z');

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function makeApp(options: Partial<Parameters<typeof createApp>[0]> = {}): {
  app: AppType;
  db: AppDatabase;
} {
  const { db, dir } = createTestDatabase();
  cleanup = () => removeTestDatabase(dir);
  const app = createApp({
    db,
    log: () => {},
    sessionSecret: SESSION_SECRET,
    ...options,
  });
  return { app, db };
}

function usersApp(options: Partial<Parameters<typeof createApp>[0]> = {}): {
  app: AppType;
  db: AppDatabase;
  removedPaths: string[];
} {
  const removedPaths: string[] = [];
  const built = makeApp({
    ...options,
    removeStoredFile: (storedPath) => void removedPaths.push(storedPath),
  });
  return { ...built, removedPaths };
}

function request(
  app: AppType,
  path: string,
  method: 'GET' | 'POST' | 'DELETE',
  options: { body?: unknown; cookie?: string } = {},
) {
  return app.request(path, {
    method,
    headers: {
      ...(options.body !== undefined
        ? { 'content-type': 'application/json' }
        : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
  });
}

function getJson(app: AppType, path: string, cookie?: string) {
  return request(app, path, 'GET', { cookie });
}

function postJson(app: AppType, path: string, body: unknown, cookie?: string) {
  return request(app, path, 'POST', { body, cookie });
}

function deleteJson(app: AppType, path: string, cookie?: string) {
  return request(app, path, 'DELETE', { cookie });
}

/** The `pmd_session=...` pair from a Set-Cookie header, for replaying requests. */
function sessionCookie(res: Response): string {
  const header = res.headers.get('set-cookie');
  if (!header) throw new Error('no set-cookie header');
  const pair = header.split(';')[0];
  if (!pair) throw new Error(`malformed set-cookie: ${header}`);
  return pair;
}

async function signedIn(app: AppType, email = 'reader@example.com') {
  const res = await postJson(app, '/api/auth/register', {
    email,
    password: 'correct horse battery',
  });
  return sessionCookie(res);
}

/** Registers the ADMIN_EMAIL account; the app must be built with it set. */
async function adminSignedIn(app: AppType, email = 'owner@example.com') {
  return signedIn(app, email);
}

function userIdFor(db: AppDatabase, email: string): number {
  const row = db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .get();
  if (!row) throw new Error(`no user ${email}`);
  return row.id;
}

function seedEntitlement(
  db: AppDatabase,
  userId: number,
  plan: 'pro' | 'premium',
  expiresAt: string,
): void {
  db.insert(entitlements)
    .values({ userId, plan, expiresAt: new Date(expiresAt) })
    .run();
}

const TXID = '9f2c7a01b4e5d6f8a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0';

/** A user order, created and submitted (payment details in). */
async function createUserOrder(
  app: AppType,
  db: AppDatabase,
  options: {
    email?: string;
    amount?: number;
    plan?: 'pro' | 'premium';
    method?: 'USDT-TRC20' | 'LTC';
  } = {},
): Promise<number> {
  setSetting(db, WALLETS_KEY, WALLETS);
  setSetting(db, LTC_RATE_KEY, 320.5);
  const cookie = await signedIn(app, options.email);
  const created = await postJson(
    app,
    '/api/orders',
    {
      plan: options.plan ?? 'pro',
      durationMonths: 3,
      paymentMethod: options.method ?? 'USDT-TRC20',
    },
    cookie,
  );
  expect(created.status).toBe(201);
  const orderId = ((await created.json()) as { order: { id: number } }).order
    .id;
  const submitted = await postJson(
    app,
    `/api/orders/${orderId}/submission`,
    {
      network: options.method === 'LTC' ? 'mainnet' : 'TRC20',
      txid: TXID,
      amount: options.amount ?? 9,
    },
    cookie,
  );
  expect(submitted.status).toBe(200);
  return orderId;
}

async function auditEntries(app: AppType, cookie: string) {
  const res = await getJson(app, '/api/admin/audit', cookie);
  expect(res.status).toBe(200);
  return ((await res.json()) as { entries: unknown[] }).entries;
}

describe('gate', () => {
  it('rejects anonymous visitors with 401 and non-admins with 403', async () => {
    const { app } = usersApp({ adminEmail: 'owner@example.com' });
    const cookie = await signedIn(app);

    for (const path of ['/api/admin/users', '/api/admin/users/1']) {
      expect((await getJson(app, path)).status).toBe(401);
      expect((await getJson(app, path, cookie)).status).toBe(403);
    }
    expect(
      (await postJson(app, '/api/admin/users/1/entitlement', {}, cookie))
        .status,
    ).toBe(403);
    expect(
      (await deleteJson(app, '/api/admin/users/1/entitlement', cookie)).status,
    ).toBe(403);
    expect(
      (await postJson(app, '/api/admin/users/1/quota/comp', {}, cookie)).status,
    ).toBe(403);
    expect(
      (await postJson(app, '/api/admin/users/1/password', {}, cookie)).status,
    ).toBe(403);
    expect((await deleteJson(app, '/api/admin/users/1', cookie)).status).toBe(
      403,
    );
  });
});

describe('GET /api/admin/users', () => {
  it('lists users newest-first with entitlement and this period’s usage', async () => {
    const { app, db } = usersApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
    });
    await signedIn(app, 'reader@example.com');
    await signedIn(app, 'second@example.com');
    seedEntitlement(
      db,
      userIdFor(db, 'reader@example.com'),
      'pro',
      '2027-01-05T00:00:00.000Z',
    );
    const admin = await adminSignedIn(app);

    const res = await getJson(app, '/api/admin/users', admin);

    expect(res.status).toBe(200);
    const { users: rows } = (await res.json()) as {
      users: Array<Record<string, unknown>>;
    };
    expect(rows.map((row) => row.email)).toEqual([
      'owner@example.com',
      'second@example.com',
      'reader@example.com',
    ]);
    expect(rows[2]).toMatchObject({
      email: 'reader@example.com',
      isAdmin: false,
      entitlement: {
        plan: 'pro',
        expiresAt: '2027-01-05T00:00:00.000Z',
      },
      usage: {
        period: '2026-09',
        used: 0,
        comps: 0,
        allowance: 300,
      },
    });
  });

  it('counts only comps toward the allowance when the entitlement has expired', async () => {
    const { app, db } = usersApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
    });
    await signedIn(app);
    seedEntitlement(
      db,
      userIdFor(db, 'reader@example.com'),
      'premium',
      '2026-08-01T00:00:00.000Z',
    );
    db.insert(exportUsage)
      .values({
        userId: userIdFor(db, 'reader@example.com'),
        period: '2026-09',
        count: 7,
        comps: 20,
      })
      .run();
    const admin = await adminSignedIn(app);

    const res = await getJson(app, '/api/admin/users', admin);

    const { users: rows } = (await res.json()) as {
      users: Array<{ email: string; usage: Record<string, number> }>;
    };
    expect(
      rows.find((row) => row.email === 'reader@example.com')?.usage,
    ).toEqual({
      period: '2026-09',
      used: 7,
      comps: 20,
      allowance: 20,
    });
  });

  it('searches by email substring, case-insensitively, without wildcard injection', async () => {
    const { app } = usersApp({ adminEmail: 'owner@example.com' });
    await signedIn(app, 'alice@example.com');
    await signedIn(app, 'bob@example.com');
    const admin = await adminSignedIn(app);

    const search = async (query: string) => {
      const res = await getJson(
        app,
        `/api/admin/users?query=${encodeURIComponent(query)}`,
        admin,
      );
      const { users: rows } = (await res.json()) as {
        users: Array<{ email: string }>;
      };
      return rows.map((row) => row.email);
    };

    expect(await search('ALICE')).toEqual(['alice@example.com']);
    expect(await search('bob@ex')).toEqual(['bob@example.com']);
    expect(await search('a%b@example.com')).toEqual([]);
    expect(await search('nobody@nowhere')).toEqual([]);
  });
});

describe('GET /api/admin/users/:id', () => {
  it('shows the user with entitlement, usage, and Order history', async () => {
    const { app, db } = usersApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
    });
    const orderId = await createUserOrder(app, db, { amount: 9 });
    db.insert(exportUsage)
      .values({
        userId: userIdFor(db, 'reader@example.com'),
        period: '2026-09',
        count: 4,
      })
      .run();
    db.insert(aiUsage)
      .values({
        userId: userIdFor(db, 'reader@example.com'),
        period: '2026-09',
        count: 12,
      })
      .run();
    const admin = await adminSignedIn(app);

    const res = await getJson(
      app,
      `/api/admin/users/${userIdFor(db, 'reader@example.com')}`,
      admin,
    );

    expect(res.status).toBe(200);
    const { user } = (await res.json()) as {
      user: {
        email: string;
        entitlement: unknown;
        usage: Record<string, number>;
        aiUsage: Record<string, number>;
        orders: Array<Record<string, unknown>>;
      };
    };
    expect(user.email).toBe('reader@example.com');
    expect(user.entitlement).toBeNull();
    expect(user.usage).toEqual({
      period: '2026-09',
      used: 4,
      comps: 0,
      allowance: 0,
    });
    // AI Actions have their own counter and their own allowance (03).
    expect(user.aiUsage).toEqual({
      period: '2026-09',
      used: 12,
      allowance: 0,
      remaining: 0,
    });
    expect(user.orders).toHaveLength(1);
    expect(user.orders[0]).toMatchObject({
      id: orderId,
      userEmail: 'reader@example.com',
      referenceCode: expect.any(String),
      amountExpected: '9',
      status: 'pending',
    });
  });

  it("shows the user's AI Action count and remaining allowance for the plan", async () => {
    const { app, db } = usersApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
    });
    await signedIn(app);
    seedEntitlement(
      db,
      userIdFor(db, 'reader@example.com'),
      'pro',
      '2027-01-05T00:00:00.000Z',
    );
    db.insert(aiUsage)
      .values({
        userId: userIdFor(db, 'reader@example.com'),
        period: '2026-09',
        count: 12,
      })
      .run();
    const admin = await adminSignedIn(app);

    const res = await getJson(
      app,
      `/api/admin/users/${userIdFor(db, 'reader@example.com')}`,
      admin,
    );

    const { user } = (await res.json()) as {
      user: { aiUsage: Record<string, number> };
    };
    expect(user.aiUsage).toEqual({
      period: '2026-09',
      used: 12,
      allowance: 100,
      remaining: 88,
    });
  });

  it('404s for unknown and malformed ids', async () => {
    const { app } = usersApp({ adminEmail: 'owner@example.com' });
    const admin = await adminSignedIn(app);

    expect((await getJson(app, '/api/admin/users/999', admin)).status).toBe(
      404,
    );
    expect((await getJson(app, '/api/admin/users/abc', admin)).status).toBe(
      404,
    );
  });
});

describe('POST /api/admin/users/:id/entitlement', () => {
  it('grants a duration from now when the user has none', async () => {
    const { app, db } = makeApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
    });
    await signedIn(app);
    const admin = await adminSignedIn(app);
    const id = userIdFor(db, 'reader@example.com');

    const res = await postJson(
      app,
      `/api/admin/users/${id}/entitlement`,
      {
        plan: 'premium',
        durationMonths: 3,
      },
      admin,
    );

    expect(res.status).toBe(200);
    const { user } = (await res.json()) as {
      user: {
        entitlement: Record<string, string>;
        usage: Record<string, number>;
      };
    };
    expect(user.entitlement).toEqual({
      plan: 'premium',
      // Sep 11 + 3 months.
      expiresAt: '2026-12-11T00:00:00.000Z',
    });
    // The grant re-evaluates the gates: the Premium quota is now the allowance.
    expect(user.usage.allowance).toBe(1000);
    void db;
  });

  it('stacks a duration onto a still-active entitlement', async () => {
    const { app, db } = makeApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
    });
    await signedIn(app);
    seedEntitlement(
      db,
      userIdFor(db, 'reader@example.com'),
      'pro',
      '2027-01-31T00:00:00.000Z',
    );
    const admin = await adminSignedIn(app);
    const id = userIdFor(db, 'reader@example.com');

    const res = await postJson(
      app,
      `/api/admin/users/${id}/entitlement`,
      {
        plan: 'pro',
        durationMonths: 1,
      },
      admin,
    );

    expect(res.status).toBe(200);
    const { user } = (await res.json()) as {
      user: { entitlement: Record<string, string> };
    };
    // Jan 31 + 1 month clamps to the shorter February.
    expect(user.entitlement).toEqual({
      plan: 'pro',
      expiresAt: '2027-02-28T00:00:00.000Z',
    });
  });

  it('sets a custom expiry date through the end of that UTC day', async () => {
    const { app, db } = makeApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
    });
    await signedIn(app);
    const admin = await adminSignedIn(app);
    const id = userIdFor(db, 'reader@example.com');

    const res = await postJson(
      app,
      `/api/admin/users/${id}/entitlement`,
      {
        plan: 'pro',
        expiresAt: '2027-01-05',
      },
      admin,
    );

    expect(res.status).toBe(200);
    const { user } = (await res.json()) as {
      user: { entitlement: Record<string, string> };
    };
    expect(user.entitlement).toEqual({
      plan: 'pro',
      expiresAt: '2027-01-05T23:59:59.999Z',
    });
  });

  it('validates the plan and the grant body', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    await signedIn(app);
    const admin = await adminSignedIn(app);
    const id = userIdFor(db, 'reader@example.com');

    const expect400 = async (body: unknown) => {
      const res = await postJson(
        app,
        `/api/admin/users/${id}/entitlement`,
        body,
        admin,
      );
      expect(res.status).toBe(400);
    };

    await expect400({});
    await expect400({ plan: 'free', durationMonths: 1 });
    await expect400({ durationMonths: 3 });
    await expect400({ plan: 'pro' });
    await expect400({ plan: 'pro', durationMonths: 2 });
    await expect400({
      plan: 'pro',
      durationMonths: 1,
      expiresAt: '2027-01-01',
    });
    await expect400({ plan: 'pro', expiresAt: 'yesterday' });
    await expect400({ plan: 'pro', expiresAt: '2020-01-01' });
  });

  it('writes an audit entry with before and after snapshots', async () => {
    const { app, db } = makeApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
    });
    await signedIn(app);
    seedEntitlement(
      db,
      userIdFor(db, 'reader@example.com'),
      'pro',
      '2027-01-31T00:00:00.000Z',
    );
    const admin = await adminSignedIn(app);
    const id = userIdFor(db, 'reader@example.com');

    await postJson(
      app,
      `/api/admin/users/${id}/entitlement`,
      {
        plan: 'pro',
        durationMonths: 1,
      },
      admin,
    );

    const entries = (await auditEntries(app, admin)) as Array<{
      action: string;
      targetType: string;
      targetId: string;
      before: unknown;
      after: unknown;
    }>;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: 'entitlement.grant',
      targetType: 'user',
      targetId: String(id),
      before: { plan: 'pro', expiresAt: '2027-01-31T00:00:00.000Z' },
      after: { plan: 'pro', expiresAt: '2027-02-28T00:00:00.000Z' },
    });
  });

  it('404s for an unknown user', async () => {
    const { app } = makeApp({ adminEmail: 'owner@example.com' });
    const admin = await adminSignedIn(app);

    const res = await postJson(
      app,
      '/api/admin/users/999/entitlement',
      {
        plan: 'pro',
        durationMonths: 1,
      },
      admin,
    );

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/users/:id/entitlement', () => {
  it('removes the entitlement so the gates re-lock', async () => {
    const { app, db } = makeApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
    });
    await signedIn(app);
    seedEntitlement(
      db,
      userIdFor(db, 'reader@example.com'),
      'pro',
      '2027-01-31T00:00:00.000Z',
    );
    const admin = await adminSignedIn(app);
    const id = userIdFor(db, 'reader@example.com');

    const res = await deleteJson(
      app,
      `/api/admin/users/${id}/entitlement`,
      admin,
    );

    expect(res.status).toBe(200);
    const { user } = (await res.json()) as {
      user: { entitlement: unknown; usage: Record<string, number> };
    };
    expect(user.entitlement).toBeNull();
    expect(user.usage.allowance).toBe(0);
    expect(
      db.select().from(entitlements).where(eq(entitlements.userId, id)).all(),
    ).toEqual([]);
  });

  it('409s when there is nothing to revoke, and still 404s for unknown users', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    await signedIn(app);
    const admin = await adminSignedIn(app);
    const id = userIdFor(db, 'reader@example.com');

    expect(
      (await deleteJson(app, `/api/admin/users/${id}/entitlement`, admin))
        .status,
    ).toBe(409);
    expect(
      (await deleteJson(app, '/api/admin/users/999/entitlement', admin)).status,
    ).toBe(404);
  });

  it('audit-logs the revoke with the removed entitlement', async () => {
    const { app, db } = makeApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
    });
    await signedIn(app);
    seedEntitlement(
      db,
      userIdFor(db, 'reader@example.com'),
      'premium',
      '2027-01-31T00:00:00.000Z',
    );
    const admin = await adminSignedIn(app);
    const id = userIdFor(db, 'reader@example.com');

    await deleteJson(app, `/api/admin/users/${id}/entitlement`, admin);

    const entries = (await auditEntries(app, admin)) as Array<{
      action: string;
      before: unknown;
      after: unknown;
    }>;
    expect(entries[0]).toMatchObject({
      action: 'entitlement.revoke',
      before: { plan: 'premium', expiresAt: '2027-01-31T00:00:00.000Z' },
      after: null,
    });
  });
});

describe('POST /api/admin/users/:id/quota/comp', () => {
  it('adds extra allowance to the current period', async () => {
    const { app, db } = makeApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
    });
    await signedIn(app);
    seedEntitlement(
      db,
      userIdFor(db, 'reader@example.com'),
      'pro',
      '2027-01-31T00:00:00.000Z',
    );
    const admin = await adminSignedIn(app);
    const id = userIdFor(db, 'reader@example.com');

    const res = await postJson(
      app,
      `/api/admin/users/${id}/quota/comp`,
      {
        amount: 50,
      },
      admin,
    );

    expect(res.status).toBe(200);
    const { user } = (await res.json()) as {
      user: { usage: Record<string, number> };
    };
    // Pro's 300 monthly quota plus the 50 comped exports.
    expect(user.usage).toEqual({
      period: '2026-09',
      used: 0,
      comps: 50,
      allowance: 350,
    });
  });

  it('retracts with a negative amount but never below zero comps', async () => {
    const { app, db } = makeApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
    });
    await signedIn(app);
    db.insert(exportUsage)
      .values({
        userId: userIdFor(db, 'reader@example.com'),
        period: '2026-09',
        comps: 30,
      })
      .run();
    const admin = await adminSignedIn(app);
    const id = userIdFor(db, 'reader@example.com');

    const retracted = await postJson(
      app,
      `/api/admin/users/${id}/quota/comp`,
      { amount: -10 },
      admin,
    );
    expect(retracted.status).toBe(200);
    const { user } = (await retracted.json()) as {
      user: { usage: Record<string, number> };
    };
    expect(user.usage.comps).toBe(20);

    const floored = await postJson(
      app,
      `/api/admin/users/${id}/quota/comp`,
      { amount: -100 },
      admin,
    );
    expect(floored.status).toBe(400);
  });

  it('rejects zero, non-integers, and absurd magnitudes', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    await signedIn(app);
    const admin = await adminSignedIn(app);
    const id = userIdFor(db, 'reader@example.com');

    for (const amount of [0, 1.5, '10', null, 10_000_000]) {
      const res = await postJson(
        app,
        `/api/admin/users/${id}/quota/comp`,
        { amount },
        admin,
      );
      expect(res.status).toBe(400);
    }
  });

  it('audit-logs the comp with before and after comps', async () => {
    const { app, db } = makeApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
    });
    await signedIn(app);
    const admin = await adminSignedIn(app);
    const id = userIdFor(db, 'reader@example.com');

    await postJson(
      app,
      `/api/admin/users/${id}/quota/comp`,
      {
        amount: 5,
      },
      admin,
    );

    const entries = (await auditEntries(app, admin)) as Array<{
      action: string;
      before: unknown;
      after: unknown;
    }>;
    expect(entries[0]).toMatchObject({
      action: 'quota.comp',
      before: { period: '2026-09', comps: 0 },
      after: { period: '2026-09', comps: 5 },
    });
  });
});

describe('POST /api/admin/users/:id/password', () => {
  it('returns a temporary password that works, and revokes existing sessions', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    const oldCookie = await signedIn(app);
    const admin = await adminSignedIn(app);
    const id = userIdFor(db, 'reader@example.com');

    const res = await postJson(
      app,
      `/api/admin/users/${id}/password`,
      {},
      admin,
    );

    expect(res.status).toBe(200);
    const { temporaryPassword } = (await res.json()) as {
      temporaryPassword: string;
    };
    expect(temporaryPassword.length).toBeGreaterThanOrEqual(16);

    // The old session is gone; the temp password signs in.
    expect((await getJson(app, '/api/auth/me', oldCookie)).status).toBe(401);
    const login = await postJson(app, '/api/auth/login', {
      email: 'reader@example.com',
      password: temporaryPassword,
    });
    expect(login.status).toBe(200);
  });

  it('refuses resetting your own password through the panel', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    const admin = await adminSignedIn(app);

    const res = await postJson(
      app,
      `/api/admin/users/${userIdFor(db, 'owner@example.com')}/password`,
      {},
      admin,
    );

    expect(res.status).toBe(409);
  });

  it('audit-logs the reset with the revoked session count', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    await signedIn(app);
    const admin = await adminSignedIn(app);
    const id = userIdFor(db, 'reader@example.com');

    await postJson(app, `/api/admin/users/${id}/password`, {}, admin);

    const entries = (await auditEntries(app, admin)) as Array<{
      action: string;
      after: unknown;
    }>;
    expect(entries[0]).toMatchObject({
      action: 'user.password_reset',
      after: { sessionsRevoked: 1 },
    });
    expect(
      db.select().from(sessions).where(eq(sessions.userId, id)).all(),
    ).toEqual([]);
  });
});

describe('DELETE /api/admin/users/:id', () => {
  it('deletes the account and its data, anonymizes Orders, and audit-logs', async () => {
    const { app, db, removedPaths } = usersApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
    });
    await signedIn(app);
    const orderId = await createUserOrder(app, db, {
      email: 'doomed@example.com',
    });
    db.insert(exportsHistory)
      .values({
        userId: userIdFor(db, 'doomed@example.com'),
        name: 'doc.pdf',
        pages: 3,
        storedPath: '/data/exports/0001/doc.pdf',
        expiresAt: new Date('2026-10-11T00:00:00.000Z'),
      })
      .run();
    const admin = await adminSignedIn(app);
    const doomedId = userIdFor(db, 'doomed@example.com');

    const res = await deleteJson(app, `/api/admin/users/${doomedId}`, admin);

    expect(res.status).toBe(204);
    // The user and everything that belongs to them is gone.
    expect(db.select().from(users).where(eq(users.id, doomedId)).all()).toEqual(
      [],
    );
    expect(
      db.select().from(sessions).where(eq(sessions.userId, doomedId)).all(),
    ).toEqual([]);
    expect(
      db
        .select()
        .from(entitlements)
        .where(eq(entitlements.userId, doomedId))
        .all(),
    ).toEqual([]);
    expect(
      db
        .select()
        .from(exportUsage)
        .where(eq(exportUsage.userId, doomedId))
        .all(),
    ).toEqual([]);
    expect(
      db.select().from(aiUsage).where(eq(aiUsage.userId, doomedId)).all(),
    ).toEqual([]);
    expect(
      db
        .select()
        .from(exportsHistory)
        .where(eq(exportsHistory.userId, doomedId))
        .all(),
    ).toEqual([]);
    // The Order survives, detached from the person: user gone, note gone,
    // financial record intact.
    const order = db.select().from(orders).where(eq(orders.id, orderId)).get();
    expect(order).toMatchObject({
      userId: null,
      note: null,
      txid: TXID,
      amountExpected: '9',
      status: 'pending',
    });
    // The history file removal was requested.
    expect(removedPaths).toEqual(['/data/exports/0001/doc.pdf']);
    // The audit trail records the action, not the person.
    const entries = (await auditEntries(app, admin)) as Array<{
      action: string;
      targetId: string;
      before: unknown;
      after: unknown;
    }>;
    expect(entries[0]).toMatchObject({
      action: 'user.delete',
      targetId: String(doomedId),
      before: { ordersAnonymized: 1, historyPurged: 1 },
      after: null,
    });
  });

  it('refuses deleting the signed-in account', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    const admin = await adminSignedIn(app);

    const res = await deleteJson(
      app,
      `/api/admin/users/${userIdFor(db, 'owner@example.com')}`,
      admin,
    );

    expect(res.status).toBe(409);
  });

  it('404s for unknown users', async () => {
    const { app } = makeApp({ adminEmail: 'owner@example.com' });
    const admin = await adminSignedIn(app);

    expect((await deleteJson(app, '/api/admin/users/999', admin)).status).toBe(
      404,
    );
  });

  it('leaves anonymized Orders visible in the queue and verifiable-off', async () => {
    const { app, db } = usersApp({ adminEmail: 'owner@example.com' });
    const orderId = await createUserOrder(app, db, {
      email: 'doomed@example.com',
    });
    const admin = await adminSignedIn(app);
    await deleteJson(
      app,
      `/api/admin/users/${userIdFor(db, 'doomed@example.com')}`,
      admin,
    );

    const queue = await getJson(app, '/api/admin/orders', admin);
    const { orders: rows } = (await queue.json()) as {
      orders: Array<Record<string, unknown>>;
    };
    expect(rows[0]).toMatchObject({
      id: orderId,
      userEmail: null,
      status: 'pending',
    });

    const verify = await postJson(
      app,
      `/api/admin/orders/${orderId}/verify`,
      {
        durationMonths: 1,
      },
      admin,
    );
    expect(verify.status).toBe(409);

    const reject = await postJson(
      app,
      `/api/admin/orders/${orderId}/reject`,
      {
        reason: 'account deleted',
      },
      admin,
    );
    expect(reject.status).toBe(200);
  });
});
