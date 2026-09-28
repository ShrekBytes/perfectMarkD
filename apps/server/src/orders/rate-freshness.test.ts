import { afterEach, describe, expect, it } from 'vitest';
import { createApp, type AppType } from '../index.js';
import { registerAndVerify, testMailComposition } from '../auth/testing.js';
import type { RecordingMailer } from '../mail/testing.js';
import { createTestDatabase, removeTestDatabase } from '../db/testing.js';
import type { AppDatabase } from '../db/database.js';
import { LTC_RATE_KEY, WALLETS_KEY, setSetting } from '../db/settings.js';
import { RATE_MAX_AGE_MS, RATE_REFRESH_INTERVAL_MS } from '../rate/job.js';

const SESSION_SECRET = 'test-session-secret';
const WALLETS = {
  'USDT-TRC20': 'TTronWalletAddressForTests1234',
  'USDT-BEP20': '0xBep20WalletAddressForTests000001',
  LTC: 'ltc1qTestWalletAddressForTests00000',
};

const NOW = new Date('2026-09-28T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

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

/** Wallets set, and the Rate as the job left it `fetchedAt` ago. */
function configurePayments(
  db: AppDatabase,
  fetchedAgoMs: number | null,
  usdtPerLtc = 320.5,
): void {
  setSetting(db, WALLETS_KEY, WALLETS);
  if (fetchedAgoMs === null) {
    setSetting(db, LTC_RATE_KEY, {
      usdtPerLtc: null,
      lastSuccessAt: null,
      lastAttemptAt: null,
      lastError: 'The price feed could not be reached.',
    });
    return;
  }
  const at = new Date(NOW.getTime() - fetchedAgoMs);
  setSetting(db, LTC_RATE_KEY, {
    usdtPerLtc,
    lastSuccessAt: at.toISOString(),
    lastAttemptAt: at.toISOString(),
    lastError: null,
  });
}

const LTC_ORDER = {
  plan: 'pro',
  durationMonths: 3,
  paymentMethod: 'LTC',
};

describe('a new LTC Order and the age of the Rate', () => {
  it('quotes an LTC Order while the Rate is inside the maximum age', async () => {
    const { app, db } = makeApp();
    configurePayments(db, RATE_MAX_AGE_MS - HOUR);
    const cookie = await signedIn(app);

    const res = await postJson(app, '/api/orders', LTC_ORDER, cookie);

    expect(res.status).toBe(201);
    const { order } = (await res.json()) as { order: { coin: string } };
    expect(order.coin).toBe('LTC');
  });

  it('refuses a new LTC Order once the Rate passes the maximum age', async () => {
    const { app, db } = makeApp();
    configurePayments(db, RATE_MAX_AGE_MS + HOUR);
    const cookie = await signedIn(app);

    const res = await postJson(app, '/api/orders', LTC_ORDER, cookie);

    expect(res.status).toBe(503);
  });

  it('says the rate is refreshing, not that LTC is not set up', async () => {
    const { app, db } = makeApp();
    configurePayments(db, RATE_MAX_AGE_MS + HOUR);
    const cookie = await signedIn(app);

    const res = await postJson(app, '/api/orders', LTC_ORDER, cookie);
    const { error } = (await res.json()) as { error: string };

    // The two states are different and only one of them is alarming: a feed
    // outage is a thing that resolves itself, a missing integration is not.
    expect(error).toMatch(/refresh/i);
    expect(error).not.toMatch(/not set up/i);
    // And it must not blame the Rate for something the customer cannot act on.
    expect(error).toMatch(/USDT/);
  });

  it('keeps the unset-rate message for a Rate that was never fetched', async () => {
    const { app, db } = makeApp();
    configurePayments(db, null);
    const cookie = await signedIn(app);

    const res = await postJson(app, '/api/orders', LTC_ORDER, cookie);

    expect(res.status).toBe(503);
    const { error } = (await res.json()) as { error: string };
    expect(error).toMatch(/not set up/i);
    expect(error).not.toMatch(/refresh/i);
  });

  it('the maximum age is forty-eight hours, four refreshes wide', () => {
    expect(RATE_MAX_AGE_MS).toBe(48 * 60 * 60 * 1000);
    expect(RATE_MAX_AGE_MS).toBe(4 * RATE_REFRESH_INTERVAL_MS);
  });

  it('quotes a hand-set Rate, whose age nothing can measure', async () => {
    const { app, db } = makeApp();
    setSetting(db, WALLETS_KEY, WALLETS);
    setSetting(db, LTC_RATE_KEY, 320.5);
    const cookie = await signedIn(app);

    const res = await postJson(app, '/api/orders', LTC_ORDER, cookie);

    // Refusing here would switch LTC off on a method that is already
    // configured and being paid in, and the job replaces the figure on its
    // first run anyway.
    expect(res.status).toBe(201);
  });

  it('still creates a USDT Order while the LTC Rate is stale', async () => {
    const { app, db } = makeApp();
    configurePayments(db, RATE_MAX_AGE_MS + HOUR);
    const cookie = await signedIn(app);

    const res = await postJson(
      app,
      '/api/orders',
      { ...LTC_ORDER, paymentMethod: 'USDT-TRC20' },
      cookie,
    );

    // The Rate only moves for LTC. A stale feed is not a reason to stop
    // taking the coin that needs no rate.
    expect(res.status).toBe(201);
  });
});
