import { afterEach, describe, expect, it } from 'vitest';
import { createApp, type AppType } from '../index.js';
import { registerAndVerify, testMailComposition } from '../auth/testing.js';
import type { RecordingMailer } from '../mail/testing.js';
import { createTestDatabase, removeTestDatabase } from '../db/testing.js';
import type { AppDatabase } from '../db/database.js';
import {
  LIMITS_KEY,
  LTC_RATE_KEY,
  PRICES_KEY,
  setSetting,
  WALLETS_KEY,
} from '../db/settings.js';
import type { PlanLimits, PlanPrices } from '../db/schema.js';

const SESSION_SECRET = 'test-session-secret';

const WALLETS = {
  'USDT-TRC20': 'TTronWalletAddressForTests1234',
  'USDT-BEP20': '0xBep20WalletAddressForTests000001',
  LTC: 'ltc1qTestWalletAddressForTests00000',
};

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
  });
  return { app, db };
}

async function readPricing(app: AppType, cookie?: string) {
  const res = await app.request('/api/pricing', {
    ...(cookie ? { headers: { cookie } } : {}),
  });
  return { status: res.status, body: (await res.json()) as unknown };
}

/** Signed in, so "reachable without a session" is a fact and not an accident. */
async function signedInCookie(app: AppType) {
  return registerAndVerify(app, mailer, {
    email: 'reader@example.com',
    password: 'correct horse battery staple',
  });
}

describe('GET /api/pricing', () => {
  it('answers without a session, carrying the seeded prices and limits', async () => {
    const { app } = makeApp();

    const { status, body } = await readPricing(app);

    expect(status).toBe(200);
    expect(body).toEqual({
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
        pro: { pageCap: 300, quotaMonthly: 300, aiActionsMonthly: 100 },
        premium: { pageCap: 1000, quotaMonthly: 1000, aiActionsMonthly: 300 },
      },
    });
  });

  it('reports the prices and limits an Admin saved, not the seeds', async () => {
    const { app, db } = makeApp();
    const prices: PlanPrices = {
      pro: { monthly: 4.5, durations: { 1: 4.5, 3: 13, 6: 26, 12: 47 } },
      premium: { monthly: 9, durations: { 1: 9, 3: 27, 6: 53, 12: 90 } },
    };
    const limits: PlanLimits = {
      pro: { pageCap: 500, quotaMonthly: 450, aiActionsMonthly: 0 },
      premium: { pageCap: 2500, quotaMonthly: 2400, aiActionsMonthly: 800 },
    };
    setSetting(db, PRICES_KEY, prices);
    setSetting(db, LIMITS_KEY, limits);

    const { body } = await readPricing(app);

    // The twelve-month figure is whatever was stored, verbatim: the endpoint
    // does no arithmetic, so a deliberate discount survives it.
    expect(body).toEqual({ prices, limits });
  });

  it('carries nothing the Admin did not put there for a customer to read', async () => {
    const { app, db } = makeApp();
    setSetting(db, WALLETS_KEY, WALLETS);
    setSetting(db, LTC_RATE_KEY, 320.5);

    const { body } = await readPricing(app);
    const serialized = JSON.stringify(body);

    expect(body).not.toHaveProperty('wallets');
    expect(body).not.toHaveProperty('ltcRateUsdt');
    for (const address of Object.values(WALLETS)) {
      expect(serialized).not.toContain(address);
    }
    expect(serialized).not.toContain('320.5');
  });

  it('reads the same for a signed-in visitor as for a prospective one', async () => {
    const { app } = makeApp();
    const cookie = await signedInCookie(app);

    const signedOut = await readPricing(app);
    const signedUp = await readPricing(app, cookie);

    expect(signedUp.status).toBe(200);
    expect(signedUp.body).toEqual(signedOut.body);
  });

  it('is not cacheable — a cached price is the stale quote it exists to remove', async () => {
    const { app } = makeApp();

    const res = await app.request('/api/pricing');

    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
