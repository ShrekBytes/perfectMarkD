import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AppDatabase } from './database.js';
import {
  DURATION_MONTHS,
  PAYMENT_METHODS,
  PLANS,
  type PlanPrices,
  type WalletAddresses,
} from './schema.js';
import {
  getPlanLimits,
  getPlanPrices,
  getSetting,
  getWallets,
  LIMITS_KEY,
  pageCapFor,
  PRICES_KEY,
  setSetting,
  WALLETS_KEY,
} from './settings.js';
import { createTestDatabase, removeTestDatabase } from './testing.js';

let db: AppDatabase;
let scratchDir: string;

beforeAll(() => {
  ({ db, dir: scratchDir } = createTestDatabase());
});

afterAll(() => {
  removeTestDatabase(scratchDir);
});

describe('seeded wallets', () => {
  it('has an empty address per receiving method (admin fills them in)', () => {
    expect(getWallets(db)).toEqual(
      Object.fromEntries(PAYMENT_METHODS.map((method) => [method, ''])),
    );
  });
});

describe('seeded plan prices', () => {
  const prices = () => getPlanPrices(db);

  it('seeds Pro at 3 USDT/month and Premium at 7 USDT/month', () => {
    expect(prices().pro.monthly).toBe(3);
    expect(prices().premium.monthly).toBe(7);
  });

  it('prices every duration option, with 12 months at 10× monthly', () => {
    for (const plan of PLANS) {
      const { monthly, durations } = prices()[plan];
      expect(Object.keys(durations).sort()).toEqual(
        DURATION_MONTHS.map(String).sort(),
      );
      expect(durations[1]).toBe(monthly);
      expect(durations[3]).toBe(3 * monthly);
      expect(durations[6]).toBe(6 * monthly);
      expect(durations[12]).toBe(10 * monthly);
    }
  });
});

describe('typed accessor', () => {
  it('round-trips a setting written through setSetting', () => {
    const edited: WalletAddresses = {
      'USDT-TRC20': 'T...',
      'USDT-BEP20': '0x...',
      LTC: 'ltc1...',
    };
    setSetting(db, WALLETS_KEY, edited);
    expect(getWallets(db)).toEqual(edited);
  });

  it('returns undefined for keys that were never set', () => {
    expect(getSetting(db, 'no-such-key')).toBeUndefined();
  });

  it('rejects malformed wallets values with a clear error', () => {
    setSetting(db, WALLETS_KEY, { 'USDT-TRC20': 42 });
    expect(() => getWallets(db)).toThrow(/wallets/);
  });

  it('rejects wallets values with unknown payment methods', () => {
    setSetting(db, WALLETS_KEY, {
      'USDT-TRC20': '',
      'USDT-BEP20': '',
      LTC: '',
      SOL: '',
    });
    expect(() => getWallets(db)).toThrow(/wallets/);
  });

  it('rejects malformed prices values with a clear error', () => {
    setSetting(db, PRICES_KEY, { pro: { monthly: 'three' } });
    expect(() => getPlanPrices(db)).toThrow(/prices/);
  });

  it('rejects NaN duration prices', () => {
    setSetting(db, PRICES_KEY, {
      pro: { monthly: 3, durations: { 1: 3, 3: 9, 6: 18, 12: NaN } },
      premium: { monthly: 7, durations: { 1: 7, 3: 21, 6: 42, 12: 70 } },
    });
    expect(() => getPlanPrices(db)).toThrow(/prices/);
  });

  it('exposes keys as plain constants for direct access', () => {
    expect(WALLETS_KEY).toBe('wallets');
    expect(PRICES_KEY).toBe('prices');
  });

  it('re-validates after arbitrary writes corrupt a seeded key', () => {
    // Restore valid state for any later reader of the shared database.
    const valid: PlanPrices = {
      pro: { monthly: 3, durations: { 1: 3, 3: 9, 6: 18, 12: 30 } },
      premium: { monthly: 7, durations: { 1: 7, 3: 21, 6: 42, 12: 70 } },
    };
    setSetting(db, PRICES_KEY, valid);
    expect(getPlanPrices(db)).toEqual(valid);
  });
});

describe('pageCapFor', () => {
  it('reads the cap for a known plan', () => {
    setSetting(db, LIMITS_KEY, {
      pro: { pageCap: 300, quotaMonthly: 300 },
      premium: { pageCap: 1000, quotaMonthly: 1000 },
    });
    expect(pageCapFor(getPlanLimits(db), 'pro')).toBe(300);
    expect(pageCapFor(getPlanLimits(db), 'premium')).toBe(1000);
  });

  it('gives planless (free) and unknown plans the smallest paid cap', () => {
    setSetting(db, LIMITS_KEY, {
      pro: { pageCap: 300, quotaMonthly: 300 },
      premium: { pageCap: 1000, quotaMonthly: 1000 },
    });
    const limits = getPlanLimits(db);
    expect(pageCapFor(limits, 'free')).toBe(300);
    expect(pageCapFor(limits, 'mystery')).toBe(300);
  });
});
