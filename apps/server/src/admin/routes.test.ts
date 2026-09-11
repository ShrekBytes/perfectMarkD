import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp, type AppType } from '../index.js';
import { createTestDatabase, removeTestDatabase } from '../db/testing.js';
import type { AppDatabase } from '../db/database.js';
import { LTC_RATE_KEY, WALLETS_KEY, setSetting } from '../db/settings.js';
import { entitlements, users } from '../db/schema.js';

const SESSION_SECRET = 'test-session-secret';

const WALLETS = {
  'USDT-TRC20': 'TTronWalletAddressForTests1234',
  'USDT-BEP20': '0xBep20WalletAddressForTests000001',
  LTC: 'ltc1qTestWalletAddressForTests00000',
};

/** Fixed clock so grant arithmetic is asserted against known literals. */
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

function request(
  app: AppType,
  path: string,
  method: 'GET' | 'POST',
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

/** Wallets and the LTC rate seed empty; tests configure both explicitly. */
function configurePayments(db: AppDatabase): void {
  setSetting(db, WALLETS_KEY, WALLETS);
  setSetting(db, LTC_RATE_KEY, 320.5);
}

const TXID = '9f2c7a01b4e5d6f8a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0';

/** A user order, created and submitted (payment details in). */
async function createUserOrder(
  app: AppType,
  db: AppDatabase,
  options: {
    email?: string;
    submit?: boolean;
    amount?: number;
    plan?: 'pro' | 'premium';
  } = {},
): Promise<number> {
  configurePayments(db);
  const cookie = await signedIn(app, options.email);
  const created = await postJson(
    app,
    '/api/orders',
    {
      plan: options.plan ?? 'pro',
      durationMonths: 3,
      paymentMethod: 'USDT-TRC20',
    },
    cookie,
  );
  expect(created.status).toBe(201);
  const { order } = (await created.json()) as { order: { id: number } };
  if (options.submit !== false) {
    const submitted = await postJson(
      app,
      `/api/orders/${order.id}/submission`,
      {
        network: 'TRC20',
        txid: TXID,
        amount: options.amount ?? 9,
      },
      cookie,
    );
    expect(submitted.status).toBe(200);
  }
  return order.id;
}

function userIdFor(db: AppDatabase, email: string): number {
  const user = db.select().from(users).where(eq(users.email, email)).get();
  if (!user) throw new Error(`no user ${email}`);
  return user.id;
}

function seedEntitlement(
  db: AppDatabase,
  userId: number,
  plan: string,
  expiresAt: string,
): void {
  db.insert(entitlements)
    .values({ userId, plan, expiresAt: new Date(expiresAt) })
    .run();
}

describe('admin route gating', () => {
  it('rejects anonymous requests on every route', async () => {
    const { app } = makeApp();

    expect((await getJson(app, '/api/admin/orders')).status).toBe(401);
    expect((await postJson(app, '/api/admin/orders/1/verify', {})).status).toBe(
      401,
    );
    expect(
      (await postJson(app, '/api/admin/orders/1/reject', { reason: 'x' }))
        .status,
    ).toBe(401);
    expect((await getJson(app, '/api/admin/audit')).status).toBe(401);
  });

  it('rejects signed-in non-admins with 403', async () => {
    const { app } = makeApp();
    const cookie = await signedIn(app);

    expect((await getJson(app, '/api/admin/orders', cookie)).status).toBe(403);
    expect(
      (await postJson(app, '/api/admin/orders/1/verify', {}, cookie)).status,
    ).toBe(403);
    expect(
      (
        await postJson(
          app,
          '/api/admin/orders/1/reject',
          { reason: 'x' },
          cookie,
        )
      ).status,
    ).toBe(403);
    expect((await getJson(app, '/api/admin/audit', cookie)).status).toBe(403);
  });
});

describe('GET /api/admin/orders', () => {
  it('lists every user’s Order with its email and Entitlement state', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    const orderId = await createUserOrder(app, db, {
      email: 'reader@example.com',
    });
    const admin = await adminSignedIn(app);

    const res = await getJson(app, '/api/admin/orders', admin);

    expect(res.status).toBe(200);
    const { orders } = (await res.json()) as {
      orders: Array<Record<string, unknown>>;
    };
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      id: orderId,
      userEmail: 'reader@example.com',
      plan: 'pro',
      durationMonths: 3,
      coin: 'USDT',
      network: 'TRC20',
      amountExpected: '9',
      amountClaimed: '9',
      status: 'pending',
      txid: TXID,
      walletAddress: WALLETS['USDT-TRC20'],
      entitlement: null,
    });
  });

  it('carries the user’s current Entitlement so the Admin can see what a grant stacks onto', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    await createUserOrder(app, db);
    seedEntitlement(
      db,
      userIdFor(db, 'reader@example.com'),
      'pro',
      '2026-10-05T00:00:00.000Z',
    );
    const admin = await adminSignedIn(app);

    const res = await getJson(app, '/api/admin/orders', admin);

    const { orders } = (await res.json()) as {
      orders: Array<{ entitlement: Record<string, string> | null }>;
    };
    expect(orders[0]?.entitlement).toEqual({
      plan: 'pro',
      expiresAt: '2026-10-05T00:00:00.000Z',
    });
  });
});

describe('POST /api/admin/orders/:id/verify', () => {
  it('grants the Entitlement from now when the user has none', async () => {
    const { app, db } = makeApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
    });
    const orderId = await createUserOrder(app, db);
    const admin = await adminSignedIn(app);

    const res = await postJson(
      app,
      `/api/admin/orders/${orderId}/verify`,
      { durationMonths: 3 },
      admin,
    );

    expect(res.status).toBe(200);
    const { order, entitlement } = (await res.json()) as {
      order: Record<string, unknown>;
      entitlement: Record<string, unknown>;
    };
    expect(order).toMatchObject({ id: orderId, status: 'verified' });
    expect(typeof order.decidedAt).toBe('string');
    expect(entitlement).toEqual({
      plan: 'pro',
      expiresAt: '2026-12-11T00:00:00.000Z', // NOW + 3 months
    });
  });

  it('stacks onto the current expiry while the Entitlement is active', async () => {
    const { app, db } = makeApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
    });
    const orderId = await createUserOrder(app, db);
    seedEntitlement(
      db,
      userIdFor(db, 'reader@example.com'),
      'pro',
      '2026-10-05T00:00:00.000Z',
    );
    const admin = await adminSignedIn(app);

    const res = await postJson(
      app,
      `/api/admin/orders/${orderId}/verify`,
      { durationMonths: 3 },
      admin,
    );

    expect(res.status).toBe(200);
    const { entitlement } = (await res.json()) as {
      entitlement: { expiresAt: string };
    };
    expect(entitlement.expiresAt).toBe('2027-01-05T00:00:00.000Z');
  });

  it('grants from now once the current Entitlement has expired', async () => {
    const { app, db } = makeApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
    });
    const orderId = await createUserOrder(app, db);
    seedEntitlement(
      db,
      userIdFor(db, 'reader@example.com'),
      'pro',
      '2026-09-10T00:00:00.000Z',
    );
    const admin = await adminSignedIn(app);

    const res = await postJson(
      app,
      `/api/admin/orders/${orderId}/verify`,
      { durationMonths: 12 },
      admin,
    );

    expect(res.status).toBe(200);
    const { entitlement } = (await res.json()) as {
      entitlement: { plan: string; expiresAt: string };
    };
    expect(entitlement.expiresAt).toBe('2027-09-11T00:00:00.000Z');
  });

  it('verifying a different plan takes the Order’s plan and stacks from the current expiry', async () => {
    const { app, db } = makeApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
    });
    const orderId = await createUserOrder(app, db, { plan: 'premium' });
    seedEntitlement(
      db,
      userIdFor(db, 'reader@example.com'),
      'pro',
      '2026-10-05T00:00:00.000Z',
    );
    const admin = await adminSignedIn(app);

    const res = await postJson(
      app,
      `/api/admin/orders/${orderId}/verify`,
      { durationMonths: 1 },
      admin,
    );

    expect(res.status).toBe(200);
    const { entitlement } = (await res.json()) as {
      entitlement: { plan: string; expiresAt: string };
    };
    expect(entitlement).toEqual({
      plan: 'premium',
      expiresAt: '2026-11-05T00:00:00.000Z', // one month past the current expiry
    });
  });

  it('sets an exact expiry when the Admin picks a custom date instead of a duration', async () => {
    const { app, db } = makeApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
    });
    const orderId = await createUserOrder(app, db);
    seedEntitlement(
      db,
      userIdFor(db, 'reader@example.com'),
      'pro',
      '2026-10-05T00:00:00.000Z',
    );
    const admin = await adminSignedIn(app);

    const res = await postJson(
      app,
      `/api/admin/orders/${orderId}/verify`,
      { expiresAt: '2027-01-05' },
      admin,
    );

    expect(res.status).toBe(200);
    const { entitlement } = (await res.json()) as {
      entitlement: { plan: string; expiresAt: string };
    };
    // A date-only custom expiry runs through the end of the chosen day (UTC).
    expect(entitlement).toEqual({
      plan: 'pro',
      expiresAt: '2027-01-05T23:59:59.999Z',
    });
  });

  it('refuses to verify an Order with no payment details submitted', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    const orderId = await createUserOrder(app, db, { submit: false });
    const admin = await adminSignedIn(app);

    const res = await postJson(
      app,
      `/api/admin/orders/${orderId}/verify`,
      { durationMonths: 3 },
      admin,
    );

    expect(res.status).toBe(409);
    const row = db
      .select()
      .from(entitlements)
      .where(eq(entitlements.userId, userIdFor(db, 'reader@example.com')))
      .get();
    expect(row).toBeUndefined();
  });

  it('refuses to verify an Order twice', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    const orderId = await createUserOrder(app, db);
    const admin = await adminSignedIn(app);

    const first = await postJson(
      app,
      `/api/admin/orders/${orderId}/verify`,
      { durationMonths: 1 },
      admin,
    );
    const second = await postJson(
      app,
      `/api/admin/orders/${orderId}/verify`,
      { durationMonths: 1 },
      admin,
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
  });

  it('rejects malformed grant bodies', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    const orderId = await createUserOrder(app, db);
    const admin = await adminSignedIn(app);

    for (const body of [
      {},
      { durationMonths: 3, expiresAt: '2027-01-05' },
      { durationMonths: 5 },
      { expiresAt: 'not a date' },
      { expiresAt: '2020-01-01' },
      { durationMonths: '3' },
    ]) {
      const res = await postJson(
        app,
        `/api/admin/orders/${orderId}/verify`,
        body,
        admin,
      );
      expect(res.status).toBe(400);
    }
  });

  it('404s unknown Order ids', async () => {
    const { app } = makeApp({ adminEmail: 'owner@example.com' });
    const admin = await adminSignedIn(app);

    const res = await postJson(
      app,
      '/api/admin/orders/9999/verify',
      { durationMonths: 1 },
      admin,
    );

    expect(res.status).toBe(404);
  });
});

describe('POST /api/admin/orders/:id/reject', () => {
  it('records the reason and returns the Order to the user with it', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    const orderId = await createUserOrder(app, db, { amount: 3 });
    const admin = await adminSignedIn(app);

    const res = await postJson(
      app,
      `/api/admin/orders/${orderId}/reject`,
      {
        reason:
          'Amount received does not match the invoice — sent 3 USDT instead of 9.',
      },
      admin,
    );

    expect(res.status).toBe(200);
    const { order } = (await res.json()) as {
      order: Record<string, unknown>;
    };
    expect(order).toMatchObject({
      id: orderId,
      status: 'rejected',
      rejectReason:
        'Amount received does not match the invoice — sent 3 USDT instead of 9.',
    });
    expect(typeof order.decidedAt).toBe('string');
  });

  it('requires a non-empty reason', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    const orderId = await createUserOrder(app, db);
    const admin = await adminSignedIn(app);

    for (const body of [
      {},
      { reason: '' },
      { reason: '   ' },
      { reason: 42 },
    ]) {
      const res = await postJson(
        app,
        `/api/admin/orders/${orderId}/reject`,
        body,
        admin,
      );
      expect(res.status).toBe(400);
    }
  });

  it('refuses to reject an Order that is already decided', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    const orderId = await createUserOrder(app, db);
    const admin = await adminSignedIn(app);
    await postJson(
      app,
      `/api/admin/orders/${orderId}/verify`,
      { durationMonths: 1 },
      admin,
    );

    const res = await postJson(
      app,
      `/api/admin/orders/${orderId}/reject`,
      { reason: 'changed my mind' },
      admin,
    );

    expect(res.status).toBe(409);
  });

  it('404s unknown Order ids', async () => {
    const { app } = makeApp({ adminEmail: 'owner@example.com' });
    const admin = await adminSignedIn(app);

    const res = await postJson(
      app,
      '/api/admin/orders/9999/reject',
      { reason: 'nope' },
      admin,
    );

    expect(res.status).toBe(404);
  });
});

describe('GET /api/admin/audit', () => {
  it('records every decision with the admin, before, and after', async () => {
    const { app, db } = makeApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
    });
    const orderId = await createUserOrder(app, db);
    const admin = await adminSignedIn(app);
    await postJson(
      app,
      `/api/admin/orders/${orderId}/verify`,
      { durationMonths: 3 },
      admin,
    );

    const res = await getJson(app, '/api/admin/audit', admin);

    expect(res.status).toBe(200);
    const { entries } = (await res.json()) as {
      entries: Array<Record<string, unknown>>;
    };
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      adminEmail: 'owner@example.com',
      action: 'order.verify',
      targetType: 'order',
      targetId: String(orderId),
      before: { order: { status: 'pending' }, entitlement: null },
      after: {
        order: { status: 'verified' },
        entitlement: {
          plan: 'pro',
          expiresAt: '2026-12-11T00:00:00.000Z',
        },
      },
    });
    expect(typeof entries[0]?.createdAt).toBe('string');
  });

  it('lists newest first, one entry per decision', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    const firstId = await createUserOrder(app, db, {
      email: 'reader@example.com',
    });
    const secondId = await createUserOrder(app, db, {
      email: 'other@example.com',
    });
    const admin = await adminSignedIn(app);
    await postJson(
      app,
      `/api/admin/orders/${firstId}/reject`,
      { reason: 'Wrong wallet — resubmit on TRC-20.' },
      admin,
    );
    await postJson(
      app,
      `/api/admin/orders/${secondId}/verify`,
      { durationMonths: 6 },
      admin,
    );

    const res = await getJson(app, '/api/admin/audit', admin);

    const { entries } = (await res.json()) as {
      entries: Array<{ action: string; targetId: string }>;
    };
    expect(entries.map((entry) => [entry.action, entry.targetId])).toEqual([
      ['order.verify', String(secondId)],
      ['order.reject', String(firstId)],
    ]);
  });
});
