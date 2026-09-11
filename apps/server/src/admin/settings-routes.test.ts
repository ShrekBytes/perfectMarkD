import { afterEach, describe, expect, it } from 'vitest';
import { createApp, type AppType } from '../index.js';
import { createTestDatabase, removeTestDatabase } from '../db/testing.js';
import type { AppDatabase } from '../db/database.js';
import {
  getPlanLimits,
  getPlanPrices,
  getWallets,
  PRICES_KEY,
  WALLETS_KEY,
} from '../db/settings.js';
import { settingsKv } from '../db/schema.js';

const SESSION_SECRET = 'test-session-secret';

const WALLETS = {
  'USDT-TRC20': 'TTronWalletAddressForTests1234',
  'USDT-BEP20': '0xBep20WalletAddressForTests000001',
  LTC: 'ltc1qTestWalletAddressForTests00000',
};

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
  method: 'GET' | 'POST' | 'PUT',
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

function putJson(app: AppType, path: string, body: unknown, cookie?: string) {
  return request(app, path, 'PUT', { body, cookie });
}

function postJson(app: AppType, path: string, body: unknown, cookie?: string) {
  return request(app, path, 'POST', { body, cookie });
}

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

async function adminSignedIn(app: AppType, email = 'owner@example.com') {
  return signedIn(app, email);
}

async function auditEntries(app: AppType, cookie: string) {
  const res = await getJson(app, '/api/admin/audit', cookie);
  expect(res.status).toBe(200);
  return ((await res.json()) as { entries: unknown[] }).entries;
}

describe('gate', () => {
  it('rejects anonymous visitors with 401 and non-admins with 403', async () => {
    const { app } = makeApp({ adminEmail: 'owner@example.com' });
    const cookie = await signedIn(app);

    expect((await getJson(app, '/api/admin/settings')).status).toBe(401);
    expect((await getJson(app, '/api/admin/settings', cookie)).status).toBe(
      403,
    );
    expect(
      (await putJson(app, '/api/admin/settings/wallets', WALLETS, cookie))
        .status,
    ).toBe(403);
  });
});

describe('GET /api/admin/settings', () => {
  it('returns the seeded defaults (no placeholder wallets or rates ship)', async () => {
    const { app } = makeApp({ adminEmail: 'owner@example.com' });
    const admin = await adminSignedIn(app);

    const res = await getJson(app, '/api/admin/settings', admin);

    expect(res.status).toBe(200);
    const { settings } = (await res.json()) as {
      settings: Record<string, unknown>;
    };
    expect(settings).toEqual({
      wallets: {
        'USDT-TRC20': '',
        'USDT-BEP20': '',
        LTC: '',
      },
      prices: {
        pro: {
          monthly: 3,
          durations: { 1: 3, 3: 9, 6: 18, 12: 30 },
        },
        premium: {
          monthly: 7,
          durations: { 1: 7, 3: 21, 6: 42, 12: 70 },
        },
      },
      limits: {
        pro: { pageCap: 300, quotaMonthly: 300 },
        premium: { pageCap: 1000, quotaMonthly: 1000 },
      },
      ltcRateUsdt: null,
    });
  });
});

describe('PUT /api/admin/settings/:key', () => {
  it('updates wallets, writes an audit entry, and feeds new Orders', async () => {
    const { app, db } = makeApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
    });
    const admin = await adminSignedIn(app);

    const res = await putJson(
      app,
      '/api/admin/settings/wallets',
      WALLETS,
      admin,
    );

    expect(res.status).toBe(200);
    const { settings } = (await res.json()) as {
      settings: { wallets: Record<string, string> };
    };
    expect(settings.wallets).toEqual(WALLETS);
    expect(getWallets(db)).toEqual(WALLETS);

    const entries = (await auditEntries(app, admin)) as Array<{
      action: string;
      targetType: string;
      targetId: string;
      before: unknown;
      after: unknown;
    }>;
    expect(entries[0]).toMatchObject({
      action: 'settings.update',
      targetType: 'settings',
      targetId: WALLETS_KEY,
      before: { 'USDT-TRC20': '', 'USDT-BEP20': '', LTC: '' },
      after: WALLETS,
    });
  });

  it('takes effect on Order creation without a redeploy', async () => {
    const { app } = makeApp({ adminEmail: 'owner@example.com' });
    await signedIn(app);
    const admin = await adminSignedIn(app);

    await putJson(app, '/api/admin/settings/wallets', WALLETS, admin);
    const cookie = await signedIn(app, 'buyer@example.com');
    const created = await postJson(
      app,
      '/api/orders',
      {
        plan: 'pro',
        durationMonths: 3,
        paymentMethod: 'USDT-TRC20',
      },
      cookie,
    );

    expect(created.status).toBe(201);
    const { order } = (await created.json()) as {
      order: { walletAddress: string | null };
    };
    expect(order.walletAddress).toBe(WALLETS['USDT-TRC20']);
  });

  it('updates prices, audit-logs, and new Orders use them', async () => {
    const { app, db } = makeApp({
      adminEmail: 'owner@example.com',
      now: () => NOW,
    });
    const admin = await adminSignedIn(app);
    const prices = getPlanPrices(db);
    prices.pro = { monthly: 4, durations: { 1: 4, 3: 12, 6: 24, 12: 40 } };

    const res = await putJson(app, '/api/admin/settings/prices', prices, admin);

    expect(res.status).toBe(200);
    expect(getPlanPrices(db).pro.monthly).toBe(4);

    const entries = (await auditEntries(app, admin)) as Array<{
      targetId: string;
      before: unknown;
    }>;
    expect(entries[0]).toMatchObject({ targetId: PRICES_KEY });

    await putJson(app, '/api/admin/settings/wallets', WALLETS, admin);
    const cookie = await signedIn(app, 'buyer@example.com');
    const created = await postJson(
      app,
      '/api/orders',
      {
        plan: 'pro',
        durationMonths: 3,
        paymentMethod: 'USDT-TRC20',
      },
      cookie,
    );
    const { order } = (await created.json()) as {
      order: { amountExpected: string };
    };
    expect(order.amountExpected).toBe('12');
  });

  it('updates plan limits (page caps and monthly quotas)', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    const admin = await adminSignedIn(app);

    const res = await putJson(
      app,
      '/api/admin/settings/limits',
      {
        pro: { pageCap: 250, quotaMonthly: 150 },
        premium: { pageCap: 1200, quotaMonthly: 2000 },
      },
      admin,
    );

    expect(res.status).toBe(200);
    expect(getPlanLimits(db)).toEqual({
      pro: { pageCap: 250, quotaMonthly: 150 },
      premium: { pageCap: 1200, quotaMonthly: 2000 },
    });
  });

  it('sets the LTC rate and LTC Orders capture it', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    await signedIn(app);
    const admin = await adminSignedIn(app);

    const res = await putJson(
      app,
      '/api/admin/settings/ltcRateUsdt',
      320.5,
      admin,
    );
    expect(res.status).toBe(200);

    await putJson(app, '/api/admin/settings/wallets', WALLETS, admin);
    const cookie = await signedIn(app, 'buyer@example.com');
    const created = await postJson(
      app,
      '/api/orders',
      {
        plan: 'pro',
        durationMonths: 3,
        paymentMethod: 'LTC',
      },
      cookie,
    );
    expect(created.status).toBe(201);
    const { order } = (await created.json()) as {
      order: {
        coin: string;
        amountExpected: string;
        ltcRateUsdt: string | null;
      };
    };
    expect(order.coin).toBe('LTC');
    expect(order.ltcRateUsdt).toBe('320.5');
    // 9 USDT at 320.5 USDT/LTC, rounded to LTC's 8 decimals.
    expect(order.amountExpected).toBe('0.02808112');
    void db;
  });

  it('clearing the LTC rate disables LTC payments again', async () => {
    const { app } = makeApp({ adminEmail: 'owner@example.com' });
    const admin = await adminSignedIn(app);

    await putJson(app, '/api/admin/settings/ltcRateUsdt', 320.5, admin);
    const cleared = await putJson(
      app,
      '/api/admin/settings/ltcRateUsdt',
      null,
      admin,
    );
    expect(cleared.status).toBe(200);
    const { settings } = (await cleared.json()) as {
      settings: { ltcRateUsdt: number | null };
    };
    expect(settings.ltcRateUsdt).toBeNull();
  });

  it('validates each key against the shapes the readers assume', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    const admin = await adminSignedIn(app);

    const expect400 = async (key: string, body: unknown) => {
      const res = await putJson(app, `/api/admin/settings/${key}`, body, admin);
      expect(res.status).toBe(400);
    };

    await expect400('wallets', null);
    await expect400('wallets', { 'USDT-TRC20': 'x' });
    await expect400('wallets', { ...WALLETS, rogue: 'x' });
    await expect400('prices', { pro: { monthly: 3, durations: {} } });
    await expect400(
      'prices',
      // A zero price would make Orders free.
      {
        pro: { monthly: 0, durations: { 1: 3, 3: 9, 6: 18, 12: 30 } },
        premium: { monthly: 7, durations: { 1: 7, 3: 21, 6: 42, 12: 70 } },
      },
    );
    await expect400('limits', {
      pro: { pageCap: 300.5, quotaMonthly: 300 },
      premium: { pageCap: 1000, quotaMonthly: 1000 },
    });
    await expect400('ltcRateUsdt', -1);
    await expect400('ltcRateUsdt', 'free');

    // Nothing was written, and no audit entries exist.
    expect(db.select().from(settingsKv).all()).toHaveLength(3);
    expect((await auditEntries(app, admin)).length).toBe(0);
  });

  it('404s for unknown settings and rejects malformed JSON bodies', async () => {
    const { app, db } = makeApp({ adminEmail: 'owner@example.com' });
    const admin = await adminSignedIn(app);

    expect(
      (await putJson(app, '/api/admin/settings/nonsense', {}, admin)).status,
    ).toBe(404);

    const raw = await app.request('/api/admin/settings/wallets', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        cookie: admin,
      },
      body: '{not json',
    });
    expect(raw.status).toBe(400);
    void db;
  });
});
