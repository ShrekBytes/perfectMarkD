import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createApp, type AppType } from '../index.js';
import { createTestDatabase, removeTestDatabase } from '../db/testing.js';
import type { AppDatabase } from '../db/database.js';
import { LTC_RATE_KEY, WALLETS_KEY, setSetting } from '../db/settings.js';
import { orders } from '../db/schema.js';
import { REFERENCE_CODE_PATTERN } from './reference-code.js';

const SESSION_SECRET = 'test-session-secret';

const WALLETS = {
  'USDT-TRC20': 'TTronWalletAddressForTests1234',
  'USDT-BEP20': '0xBep20WalletAddressForTests000001',
  LTC: 'ltc1qTestWalletAddressForTests00000',
};

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

/** Wallets and the LTC rate seed empty; tests configure both explicitly. */
function configurePayments(db: AppDatabase): void {
  setSetting(db, WALLETS_KEY, WALLETS);
  setSetting(db, LTC_RATE_KEY, 320.5);
}

const TXID = '9f2c7a01b4e5d6f8a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0';

async function createOrder(
  app: AppType,
  cookie: string,
  body: Record<string, unknown> = {
    plan: 'pro',
    durationMonths: 3,
    paymentMethod: 'USDT-TRC20',
  },
) {
  return postJson(app, '/api/orders', body, { cookie });
}

describe('POST /api/orders', () => {
  it('rejects anonymous requests', async () => {
    const { app } = makeApp();

    const res = await createOrder(app, 'pmd_session=garbage');

    expect(res.status).toBe(401);
  });

  it('creates a USDT order at the seeded price, with the wallet attached', async () => {
    const { app, db } = makeApp();
    configurePayments(db);
    const cookie = await signedIn(app);

    const res = await createOrder(app, cookie, {
      plan: 'pro',
      durationMonths: 3,
      paymentMethod: 'USDT-TRC20',
    });

    expect(res.status).toBe(201);
    const { order } = (await res.json()) as { order: Record<string, unknown> };
    expect(order).toMatchObject({
      plan: 'pro',
      durationMonths: 3,
      coin: 'USDT',
      network: 'TRC20',
      amountExpected: '9', // 3 months × 3 USDT
      ltcRateUsdt: null,
      status: 'pending',
      txid: null,
      amountClaimed: null,
      note: null,
      rejectReason: null,
      decidedAt: null,
      walletAddress: WALLETS['USDT-TRC20'],
    });
    expect(order.referenceCode).toMatch(REFERENCE_CODE_PATTERN);
    expect(typeof order.createdAt).toBe('string');
  });

  it('prices 12 months at 10× monthly (premium: 70 USDT)', async () => {
    const { app, db } = makeApp();
    configurePayments(db);
    const cookie = await signedIn(app);

    const res = await createOrder(app, cookie, {
      plan: 'premium',
      durationMonths: 12,
      paymentMethod: 'USDT-BEP20',
    });

    expect(res.status).toBe(201);
    const { order } = (await res.json()) as { order: Record<string, unknown> };
    expect(order.amountExpected).toBe('70');
    expect(order).toMatchObject({
      coin: 'USDT',
      network: 'BEP20',
      walletAddress: WALLETS['USDT-BEP20'],
    });
  });

  it('denominates LTC orders in LTC using the rate captured at creation', async () => {
    const { app, db } = makeApp();
    configurePayments(db);
    const cookie = await signedIn(app);

    // Premium 6 months = 42 USDT; 42 / 320.5 USDT-per-LTC = 0.13104524 LTC.
    const res = await createOrder(app, cookie, {
      plan: 'premium',
      durationMonths: 6,
      paymentMethod: 'LTC',
    });

    expect(res.status).toBe(201);
    const { order } = (await res.json()) as { order: Record<string, unknown> };
    expect(order).toMatchObject({
      coin: 'LTC',
      network: 'mainnet',
      amountExpected: '0.13104524',
      ltcRateUsdt: '320.5',
      walletAddress: WALLETS.LTC,
    });
  });

  it('refuses LTC orders while the admin has not set a rate', async () => {
    const { app, db } = makeApp();
    setSetting(db, WALLETS_KEY, WALLETS);
    const cookie = await signedIn(app);

    const res = await createOrder(app, cookie, {
      plan: 'premium',
      durationMonths: 6,
      paymentMethod: 'LTC',
    });

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: expect.stringMatching(/not set up yet/i),
    });
  });

  it('refuses methods whose wallet is not configured yet', async () => {
    const { app, db } = makeApp();
    configurePayments(db);
    setSetting(db, WALLETS_KEY, { ...WALLETS, 'USDT-BEP20': '' });
    const cookie = await signedIn(app);

    const res = await createOrder(app, cookie, {
      plan: 'pro',
      durationMonths: 1,
      paymentMethod: 'USDT-BEP20',
    });

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: expect.stringMatching(/not set up yet/i),
    });
  });

  it.each([
    [
      'an unknown plan',
      { plan: 'maxi', durationMonths: 1, paymentMethod: 'USDT-TRC20' },
    ],
    [
      'the free plan',
      { plan: 'free', durationMonths: 1, paymentMethod: 'USDT-TRC20' },
    ],
    [
      'an off-grid duration',
      { plan: 'pro', durationMonths: 2, paymentMethod: 'USDT-TRC20' },
    ],
    [
      'an unknown payment method',
      { plan: 'pro', durationMonths: 1, paymentMethod: 'USDT-SOL' },
    ],
    ['a non-object body', ['pro']],
  ])('rejects %s with 400', async (_name, body) => {
    const { app, db } = makeApp();
    configurePayments(db);
    const cookie = await signedIn(app);

    const res = await postJson(app, '/api/orders', body, { cookie });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: expect.any(String) });
  });
});

describe('GET /api/orders', () => {
  it('rejects anonymous requests', async () => {
    const { app } = makeApp();

    const res = await app.request('/api/orders');

    expect(res.status).toBe(401);
  });

  it('starts empty', async () => {
    const { app } = makeApp();
    const cookie = await signedIn(app);

    const res = await app.request('/api/orders', { headers: { cookie } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orders: [] });
  });

  it('lists only the caller’s orders, newest first', async () => {
    const { app, db } = makeApp();
    configurePayments(db);
    const mine = await signedIn(app);
    const theirs = await signedIn(app, 'other@example.com');
    await createOrder(app, mine, {
      plan: 'pro',
      durationMonths: 1,
      paymentMethod: 'USDT-TRC20',
    });
    await createOrder(app, theirs, {
      plan: 'premium',
      durationMonths: 1,
      paymentMethod: 'USDT-TRC20',
    });
    await createOrder(app, mine, {
      plan: 'premium',
      durationMonths: 12,
      paymentMethod: 'LTC',
    });

    const res = await app.request('/api/orders', { headers: { cookie: mine } });

    expect(res.status).toBe(200);
    const { orders: listed } = (await res.json()) as {
      orders: Array<Record<string, unknown>>;
    };
    expect(listed).toHaveLength(2);
    expect(listed[0]).toMatchObject({ plan: 'premium', durationMonths: 12 });
    expect(listed[1]).toMatchObject({ plan: 'pro', durationMonths: 1 });
  });
});

describe('POST /api/orders/:id/submission', () => {
  it('rejects anonymous requests', async () => {
    const { app } = makeApp();

    const res = await postJson(app, '/api/orders/1/submission', {
      network: 'TRC20',
      txid: TXID,
      amount: 9,
    });

    expect(res.status).toBe(401);
  });

  it('stores the payment details and reports the pending order', async () => {
    const { app, db } = makeApp();
    configurePayments(db);
    const cookie = await signedIn(app);
    const created = await createOrder(app, cookie);
    const { order } = (await created.json()) as {
      order: { id: number; referenceCode: string };
    };

    const res = await postJson(
      app,
      `/api/orders/${order.id}/submission`,
      {
        network: 'TRC20',
        txid: TXID,
        amount: 9,
        note: 'sent from an exchange',
      },
      { cookie },
    );

    expect(res.status).toBe(200);
    const { order: updated } = (await res.json()) as {
      order: Record<string, unknown>;
    };
    expect(updated).toMatchObject({
      id: order.id,
      referenceCode: order.referenceCode,
      status: 'pending',
      txid: TXID,
      amountClaimed: '9',
      note: 'sent from an exchange',
    });

    const listed = await app.request('/api/orders', { headers: { cookie } });
    const { orders: all } = (await listed.json()) as {
      orders: Array<Record<string, unknown>>;
    };
    expect(all[0]).toMatchObject({ txid: TXID, amountClaimed: '9' });
  });

  it('normalizes the claimed amount as a decimal string', async () => {
    const { app, db } = makeApp();
    configurePayments(db);
    const cookie = await signedIn(app);
    const created = await createOrder(app, cookie);
    const { order } = (await created.json()) as { order: { id: number } };

    const res = await postJson(
      app,
      `/api/orders/${order.id}/submission`,
      { network: 'TRC20', txid: TXID, amount: 9.5 },
      { cookie },
    );

    expect(res.status).toBe(200);
    const { order: updated } = (await res.json()) as {
      order: { amountClaimed: string };
    };
    expect(updated.amountClaimed).toBe('9.5');
  });

  it.each([
    ['a too-short txid', { network: 'TRC20', txid: 'abc123', amount: 9 }],
    ['a non-hex txid', { network: 'TRC20', txid: 'z'.repeat(64), amount: 9 }],
    ['a missing amount', { network: 'TRC20', txid: TXID }],
    ['a zero amount', { network: 'TRC20', txid: TXID, amount: 0 }],
    ['a negative amount', { network: 'TRC20', txid: TXID, amount: -9 }],
    ['an amount as a string', { network: 'TRC20', txid: TXID, amount: '9' }],
    ['an unknown network', { network: 'SOL', txid: TXID, amount: 9 }],
    [
      'an oversized note',
      { network: 'TRC20', txid: TXID, amount: 9, note: 'x'.repeat(1001) },
    ],
  ])('rejects %s with 400', async (_name, body) => {
    const { app, db } = makeApp();
    configurePayments(db);
    const cookie = await signedIn(app);
    const created = await createOrder(app, cookie);
    const { order } = (await created.json()) as { order: { id: number } };

    const res = await postJson(
      app,
      `/api/orders/${order.id}/submission`,
      body,
      { cookie },
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: expect.any(String) });

    const listed = await app.request('/api/orders', { headers: { cookie } });
    const { orders: all } = (await listed.json()) as {
      orders: Array<Record<string, unknown>>;
    };
    expect(all[0]?.txid).toBeNull();
  });

  it('amends a pending order — a second submission replaces the first', async () => {
    const { app, db } = makeApp();
    configurePayments(db);
    const cookie = await signedIn(app);
    const created = await createOrder(app, cookie);
    const { order } = (await created.json()) as { order: { id: number } };
    await postJson(
      app,
      `/api/orders/${order.id}/submission`,
      {
        network: 'TRC20',
        txid: TXID,
        amount: 9,
      },
      { cookie },
    );

    const res = await postJson(
      app,
      `/api/orders/${order.id}/submission`,
      { network: 'BEP20', txid: 'b'.repeat(64), amount: 9.5, note: 'fixed' },
      { cookie },
    );

    expect(res.status).toBe(200);
    const { order: updated } = (await res.json()) as {
      order: Record<string, unknown>;
    };
    expect(updated).toMatchObject({
      network: 'BEP20',
      txid: 'b'.repeat(64),
      amountClaimed: '9.5',
      note: 'fixed',
      status: 'pending',
    });
  });

  it('resubmission of a rejected order clears the rejection and returns to pending', async () => {
    const { app, db } = makeApp();
    configurePayments(db);
    const cookie = await signedIn(app);
    const created = await createOrder(app, cookie);
    const { order } = (await created.json()) as { order: { id: number } };
    // billing/02 adds the admin UI for this; until then decisions happen in
    // the database directly.
    db.update(orders)
      .set({
        status: 'rejected',
        rejectReason: 'Amount does not match the on-chain transaction.',
        decidedAt: new Date('2026-09-12T00:00:00Z'),
      })
      .where(eq(orders.id, order.id))
      .run();

    const res = await postJson(
      app,
      `/api/orders/${order.id}/submission`,
      { network: 'TRC20', txid: TXID, amount: 9.5 },
      { cookie },
    );

    expect(res.status).toBe(200);
    const { order: updated } = (await res.json()) as {
      order: Record<string, unknown>;
    };
    expect(updated).toMatchObject({
      status: 'pending',
      rejectReason: null,
      decidedAt: null,
      amountClaimed: '9.5',
    });
  });

  it('refuses a network that cannot carry the order’s coin', async () => {
    const { app, db } = makeApp();
    configurePayments(db);
    const cookie = await signedIn(app);
    const ltc = await createOrder(app, cookie, {
      plan: 'premium',
      durationMonths: 6,
      paymentMethod: 'LTC',
    });
    const { order: ltcOrder } = (await ltc.json()) as {
      order: { id: number };
    };
    const usdt = await createOrder(app, cookie);
    const { order: usdtOrder } = (await usdt.json()) as {
      order: { id: number };
    };

    const ltcOnTron = await postJson(
      app,
      `/api/orders/${ltcOrder.id}/submission`,
      { network: 'TRC20', txid: TXID, amount: 0.13 },
      { cookie },
    );
    const usdtOnLitecoin = await postJson(
      app,
      `/api/orders/${usdtOrder.id}/submission`,
      { network: 'mainnet', txid: TXID, amount: 9 },
      { cookie },
    );

    expect(ltcOnTron.status).toBe(400);
    expect(await ltcOnTron.json()).toEqual({
      error: expect.stringMatching(/Litecoin mainnet/),
    });
    expect(usdtOnLitecoin.status).toBe(400);
    expect(await usdtOnLitecoin.json()).toEqual({
      error: expect.stringMatching(/TRC-20 or BEP-20/),
    });
  });

  it('refuses submissions against a verified order', async () => {
    const { app, db } = makeApp();
    configurePayments(db);
    const cookie = await signedIn(app);
    const created = await createOrder(app, cookie);
    const { order } = (await created.json()) as { order: { id: number } };
    db.update(orders)
      .set({ status: 'verified', decidedAt: new Date('2026-09-12T00:00:00Z') })
      .where(eq(orders.id, order.id))
      .run();

    const res = await postJson(
      app,
      `/api/orders/${order.id}/submission`,
      { network: 'TRC20', txid: TXID, amount: 9 },
      { cookie },
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: expect.any(String) });
  });

  it('hides other users’ orders behind 404', async () => {
    const { app, db } = makeApp();
    configurePayments(db);
    const owner = await signedIn(app);
    const attacker = await signedIn(app, 'attacker@example.com');
    const created = await createOrder(app, owner);
    const { order } = (await created.json()) as { order: { id: number } };

    const res = await postJson(
      app,
      `/api/orders/${order.id}/submission`,
      { network: 'TRC20', txid: TXID, amount: 9 },
      { cookie: attacker },
    );

    expect(res.status).toBe(404);
  });

  it('returns 404 for unknown and malformed order ids', async () => {
    const { app, db } = makeApp();
    configurePayments(db);
    const cookie = await signedIn(app);

    const missing = await postJson(
      app,
      '/api/orders/999/submission',
      {
        network: 'TRC20',
        txid: TXID,
        amount: 9,
      },
      { cookie },
    );
    const malformed = await postJson(
      app,
      '/api/orders/nope/submission',
      {
        network: 'TRC20',
        txid: TXID,
        amount: 9,
      },
      { cookie },
    );

    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(404);
  });
});
