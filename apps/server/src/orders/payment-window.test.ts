import { afterEach, describe, expect, it } from 'vitest';
import { createApp, type AppType } from '../index.js';
import { registerAndVerify, testMailComposition } from '../auth/testing.js';
import type { RecordingMailer } from '../mail/testing.js';
import { createTestDatabase, removeTestDatabase } from '../db/testing.js';
import type { AppDatabase } from '../db/database.js';
import { WALLETS_KEY, setSetting } from '../db/settings.js';
import { orders } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { PAYMENT_WINDOW_MS } from './payment-window.js';

const SESSION_SECRET = 'test-session-secret';
const WALLETS = {
  'USDT-TRC20': 'TTronWalletAddressForTests1234',
  'USDT-BEP20': '0xBep20WalletAddressForTests000001',
  LTC: 'ltc1qTestWalletAddressForTests00000',
};

const NOW = new Date('2026-09-28T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const TXID = '9f2c7a01b4e5d6f8a3b2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0';

let cleanup: (() => void) | undefined;
let mailer: RecordingMailer;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function makeApp(): { app: AppType; db: AppDatabase } {
  const { db, dir } = createTestDatabase();
  cleanup = () => removeTestDatabase(dir);
  const composition = testMailComposition();
  mailer = composition.mail;
  const app = createApp({
    db,
    ...composition,
    log: () => {},
    sessionSecret: SESSION_SECRET,
    now: () => NOW,
  });
  return { app, db };
}

async function signedIn(app: AppType, email = 'reader@example.com') {
  return registerAndVerify(app, mailer, { email });
}

function postJson(app: AppType, path: string, body: unknown, cookie?: string) {
  return app.request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function configureWallets(db: AppDatabase): void {
  setSetting(db, WALLETS_KEY, WALLETS);
}

async function createOrder(
  app: AppType,
  cookie: string,
  paymentMethod = 'USDT-TRC20',
) {
  const res = await postJson(
    app,
    '/api/orders',
    { plan: 'pro', durationMonths: 3, paymentMethod },
    cookie,
  );
  expect(res.status).toBe(201);
  return (
    (await res.json()) as {
      order: {
        id: number;
        paymentDeadline: string | null;
        paymentExpired: boolean;
      };
    }
  ).order;
}

const SUBMISSION = { network: 'TRC20', txid: TXID, amount: 9 };

describe('the Payment Window on a new Order', () => {
  it('closes six hours after creation', async () => {
    const { app, db } = makeApp();
    configureWallets(db);
    const cookie = await signedIn(app);

    const order = await createOrder(app, cookie);

    expect(PAYMENT_WINDOW_MS).toBe(6 * HOUR);
    expect(order.paymentDeadline).toBe(
      new Date(NOW.getTime() + 6 * HOUR).toISOString(),
    );
    expect(order.paymentExpired).toBe(false);
  });

  it('applies to LTC as well as USDT', async () => {
    const { app, db } = makeApp();
    configureWallets(db);
    setSetting(db, 'ltc_rate_usdt', {
      usdtPerLtc: 320.5,
      lastSuccessAt: NOW.toISOString(),
      lastAttemptAt: NOW.toISOString(),
      lastError: null,
    });
    const cookie = await signedIn(app);

    // One rule for every coin: the rate only moves for LTC, so a USDT Order
    // gains nothing from a second window, and doubling the states every
    // surface renders costs more than it buys.
    const order = await createOrder(app, cookie, 'LTC');

    expect(order.paymentDeadline).toBe(
      new Date(NOW.getTime() + 6 * HOUR).toISOString(),
    );
  });

  it('reports the deadline on the Orders list too', async () => {
    const { app, db } = makeApp();
    configureWallets(db);
    const cookie = await signedIn(app);
    const created = await createOrder(app, cookie);

    const res = await app.request('/api/orders', {
      headers: { cookie },
    });

    const { orders: listed } = (await res.json()) as {
      orders: Array<{ id: number; paymentDeadline: string | null }>;
    };
    expect(listed[0]!.paymentDeadline).toBe(created.paymentDeadline);
  });
});

describe('submitting against an Order', () => {
  it('is accepted while the window is open', async () => {
    const { app, db } = makeApp();
    configureWallets(db);
    const cookie = await signedIn(app);
    const order = await createOrder(app, cookie);

    const res = await postJson(
      app,
      `/api/orders/${order.id}/submission`,
      SUBMISSION,
      cookie,
    );

    expect(res.status).toBe(200);
  });

  it('is refused once the window has lapsed, and points at a new Order', async () => {
    const { app, db } = makeApp();
    configureWallets(db);
    const cookie = await signedIn(app);
    const order = await createOrder(app, cookie);
    // Six hours and a minute later: the window closed.
    db.update(orders)
      .set({
        paymentDeadline: new Date(NOW.getTime() - 60_000),
      })
      .where(eq(orders.id, order.id))
      .run();

    const res = await postJson(
      app,
      `/api/orders/${order.id}/submission`,
      SUBMISSION,
      cookie,
    );

    expect(res.status).toBe(409);
    const { error } = (await res.json()) as { error: string };
    expect(error).toMatch(/lapsed|closed|no longer/i);
    expect(error).toMatch(/new order|new one|start/i);
  });

  it('does not blame the Rate for a lapsed window', async () => {
    const { app, db } = makeApp();
    configureWallets(db);
    const cookie = await signedIn(app);
    const order = await createOrder(app, cookie);
    db.update(orders)
      .set({ paymentDeadline: new Date(NOW.getTime() - 60_000) })
      .where(eq(orders.id, order.id))
      .run();

    const res = await postJson(
      app,
      `/api/orders/${order.id}/submission`,
      SUBMISSION,
      cookie,
    );
    const { error } = (await res.json()) as { error: string };

    // A USDT Order has no Rate at all. Nothing moved, and saying so would
    // send the customer after a problem that does not exist.
    expect(error).not.toMatch(/rate/i);
  });

  it('leaves a null deadline submittable however old the Order is', async () => {
    const { app, db } = makeApp();
    configureWallets(db);
    const cookie = await signedIn(app);
    const order = await createOrder(app, cookie);
    // The Orders that predate the column: null means no window, ever.
    db.update(orders)
      .set({
        paymentDeadline: null,
        createdAt: new Date(NOW.getTime() - 400 * 24 * HOUR),
      })
      .where(eq(orders.id, order.id))
      .run();

    const res = await postJson(
      app,
      `/api/orders/${order.id}/submission`,
      SUBMISSION,
      cookie,
    );

    expect(res.status).toBe(200);
  });
});

describe('resubmitting', () => {
  it('does not move the deadline', async () => {
    const { app, db } = makeApp();
    configureWallets(db);
    const cookie = await signedIn(app);
    const order = await createOrder(app, cookie);

    await postJson(
      app,
      `/api/orders/${order.id}/submission`,
      { ...SUBMISSION, amount: 3 },
      cookie,
    );
    const res = await postJson(
      app,
      `/api/orders/${order.id}/submission`,
      SUBMISSION,
      cookie,
    );

    expect(res.status).toBe(200);
    const { order: amended } = (await res.json()) as {
      order: { paymentDeadline: string | null };
    };
    // A resubmission amends the same Order, so an extending window could be
    // held open indefinitely by resubmitting — which defeats the window.
    expect(amended.paymentDeadline).toBe(order.paymentDeadline);
  });

  it('cannot be used to revive a lapsed Order', async () => {
    const { app, db } = makeApp();
    configureWallets(db);
    const cookie = await signedIn(app);
    const order = await createOrder(app, cookie);
    db.update(orders)
      .set({ paymentDeadline: new Date(NOW.getTime() - 1000) })
      .where(eq(orders.id, order.id))
      .run();

    const first = await postJson(
      app,
      `/api/orders/${order.id}/submission`,
      SUBMISSION,
      cookie,
    );
    const second = await postJson(
      app,
      `/api/orders/${order.id}/submission`,
      { ...SUBMISSION, amount: 3 },
      cookie,
    );

    expect(first.status).toBe(409);
    expect(second.status).toBe(409);
  });
});

describe('a new Order after a lapse', () => {
  it('is always creatable and priced at the current Rate', async () => {
    const { app, db } = makeApp();
    configureWallets(db);
    const first = await signedIn(app);
    const order = await createOrder(app, first);
    db.update(orders)
      .set({ paymentDeadline: new Date(NOW.getTime() - 1000) })
      .where(eq(orders.id, order.id))
      .run();

    const res = await postJson(
      app,
      '/api/orders',
      { plan: 'pro', durationMonths: 3, paymentMethod: 'USDT-TRC20' },
      first,
    );

    // A lapsed Order never blocks a new one. The window bounds the queue, not
    // the customer's ability to buy.
    expect(res.status).toBe(201);
    const { order: fresh } = (await res.json()) as {
      order: { id: number; amountExpected: string; paymentDeadline: string };
    };
    expect(fresh.id).not.toBe(order.id);
    expect(fresh.amountExpected).toBe('9');
    expect(fresh.paymentDeadline).toBe(
      new Date(NOW.getTime() + 6 * HOUR).toISOString(),
    );
  });
});

describe('the derived flag', () => {
  it('a payment submitted inside the window stays amendable after it lapses', async () => {
    const { app, db } = makeApp();
    configureWallets(db);
    const cookie = await signedIn(app);
    const order = await createOrder(app, cookie);
    await postJson(
      app,
      `/api/orders/${order.id}/submission`,
      SUBMISSION,
      cookie,
    );
    // Submitted in time, read by the Admin eight hours later.
    db.update(orders)
      .set({ paymentDeadline: new Date(NOW.getTime() - 8 * HOUR) })
      .where(eq(orders.id, order.id))
      .run();

    const res = await postJson(
      app,
      `/api/orders/${order.id}/submission`,
      { ...SUBMISSION, amount: 3 },
      cookie,
    );

    // The window bounds when a customer may submit, not when an Admin may
    // read. Refusing a correction to a payment that was made in time would
    // reject someone who paid the figure they were quoted.
    expect(res.status).toBe(200);
  });

  it('is true only while the Order is pending and the deadline has passed', async () => {
    const { app, db } = makeApp();
    configureWallets(db);
    const cookie = await signedIn(app);
    const order = await createOrder(app, cookie);

    const readFlag = async () => {
      const res = await app.request('/api/orders', { headers: { cookie } });
      return (
        (await res.json()) as { orders: Array<{ paymentExpired: boolean }> }
      ).orders[0]!.paymentExpired;
    };

    db.update(orders)
      .set({ paymentDeadline: new Date(NOW.getTime() - 1000) })
      .where(eq(orders.id, order.id))
      .run();
    expect(await readFlag()).toBe(true);

    // Verified, so there is nothing left to pay: the window no longer applies
    // to a decision that has been made.
    db.update(orders)
      .set({
        status: 'verified',
        paymentDeadline: new Date(NOW.getTime() - 1000),
      })
      .where(eq(orders.id, order.id))
      .run();
    expect(await readFlag()).toBe(false);
  });
});
