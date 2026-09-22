import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { AppDatabase } from './database.js';
import {
  DURATION_MONTHS,
  PAYMENT_METHODS,
  PLANS,
  settingsKv,
  type PlanPrices,
  type WalletAddresses,
} from './schema.js';
import {
  AI_PROVIDER_KEY,
  DEFAULT_AI_PROVIDER_CONFIG,
  getAiProviderConfig,
  getPlanLimits,
  getPlanPrices,
  getSetting,
  getWallets,
  LIMITS_KEY,
  pageCapFor,
  parseAiProviderConfig,
  parsePlanLimits,
  PRICES_KEY,
  seedSettings,
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
      pro: { pageCap: 300, quotaMonthly: 300, aiActionsMonthly: 100 },
      premium: { pageCap: 1000, quotaMonthly: 1000, aiActionsMonthly: 300 },
    });
    expect(pageCapFor(getPlanLimits(db), 'pro')).toBe(300);
    expect(pageCapFor(getPlanLimits(db), 'premium')).toBe(1000);
  });

  it('gives planless (free) and unknown plans the smallest paid cap', () => {
    setSetting(db, LIMITS_KEY, {
      pro: { pageCap: 300, quotaMonthly: 300, aiActionsMonthly: 100 },
      premium: { pageCap: 1000, quotaMonthly: 1000, aiActionsMonthly: 300 },
    });
    const limits = getPlanLimits(db);
    expect(pageCapFor(limits, 'free')).toBe(300);
    expect(pageCapFor(limits, 'mystery')).toBe(300);
  });
});

describe('seeded AI provider config', () => {
  it('seeds the default endpoint, effort, and caps (no model picked)', () => {
    expect(getAiProviderConfig(db)).toEqual({
      enabled: true,
      baseUrl: 'https://openrouter.ai/api/v1',
      model: '',
      stylesheetModel: null,
      reasoningEffort: 'medium',
      contextWindow: 128_000,
      maxOutputTokens: 16_000,
      maxInputCharacters: 60_000,
      timeoutSeconds: 60,
      burstPerMinute: 10,
    });
  });

  it('exposes the settings key for direct access', () => {
    expect(AI_PROVIDER_KEY).toBe('ai_provider');
  });
});

describe('AI provider config validation', () => {
  const valid = () => ({
    ...DEFAULT_AI_PROVIDER_CONFIG,
    model: 'vendor/model',
  });

  it('accepts a well-formed config', () => {
    expect(parseAiProviderConfig(valid())).toEqual(valid());
  });

  it('trims a trailing slash from the base URL so paths never double up', () => {
    const parsed = parseAiProviderConfig({
      ...valid(),
      baseUrl: 'https://ai.example.com/v1///',
    });
    expect(parsed?.baseUrl).toBe('https://ai.example.com/v1');
  });

  it('accepts zero as an allowance elsewhere but keeps output inside the window', () => {
    const parsed = parseAiProviderConfig({
      ...valid(),
      contextWindow: 8_000,
      maxOutputTokens: 4_000,
    });
    expect(parsed).not.toBeNull();
  });

  it('rejects malformed values', () => {
    const reject = (overrides: Record<string, unknown>) => {
      expect(parseAiProviderConfig({ ...valid(), ...overrides })).toBeNull();
    };
    expect(parseAiProviderConfig(null)).toBeNull();
    expect(parseAiProviderConfig('nope')).toBeNull();
    expect(parseAiProviderConfig({})).toBeNull();
    reject({ enabled: 'yes' });
    reject({ baseUrl: 'ftp://ai.example.com' });
    reject({ baseUrl: '' });
    reject({ baseUrl: 42 });
    reject({ model: 42 });
    reject({ stylesheetModel: '' });
    reject({ reasoningEffort: 'maximum' });
    reject({ contextWindow: 0 });
    reject({ contextWindow: 100.5 });
    reject({ maxOutputTokens: -1 });
    reject({ maxInputCharacters: 0 });
    reject({ timeoutSeconds: 0 });
    reject({ burstPerMinute: 0 });
    // A cap equal to or above the window can never fit a request.
    reject({ contextWindow: 16_000, maxOutputTokens: 16_000 });
    reject({ contextWindow: 8_000, maxOutputTokens: 16_000 });
    // Unknown fields are typos, not future-proofing.
    reject({ maxOutptTokens: 5_000 });
  });

  it('reads the config back through the typed accessor and rejects corruption', () => {
    const edited = { ...DEFAULT_AI_PROVIDER_CONFIG, model: 'vendor/model' };
    setSetting(db, AI_PROVIDER_KEY, edited);
    expect(getAiProviderConfig(db)).toEqual(edited);

    setSetting(db, AI_PROVIDER_KEY, { enabled: true });
    expect(() => getAiProviderConfig(db)).toThrow(/ai_provider/);

    // Restore valid state for any later reader of the shared database.
    setSetting(db, AI_PROVIDER_KEY, DEFAULT_AI_PROVIDER_CONFIG);
  });
});

describe('plan limits: the monthly AI allowance', () => {
  it('accepts zero (AI disabled for the plan) and rejects a negative or fractional allowance', () => {
    const limits = (aiActionsMonthly: number) => ({
      pro: { pageCap: 300, quotaMonthly: 300, aiActionsMonthly },
      premium: { pageCap: 1000, quotaMonthly: 1000, aiActionsMonthly: 300 },
    });
    expect(parsePlanLimits(limits(0))).not.toBeNull();
    expect(parsePlanLimits(limits(-1))).toBeNull();
    expect(parsePlanLimits(limits(1.5))).toBeNull();
    expect(
      parsePlanLimits({
        pro: { pageCap: 300, quotaMonthly: 300 },
        premium: { pageCap: 1000, quotaMonthly: 1000, aiActionsMonthly: 300 },
      }),
    ).toBeNull();
  });

  it('fills the allowance into limits seeded before the field existed, keeping admin edits', () => {
    // The shape a pre-AI upgrade has in settings_kv: both older fields edited
    // by the Admin, no allowance field.
    setSetting(db, LIMITS_KEY, {
      pro: { pageCap: 250, quotaMonthly: 150 },
      premium: { pageCap: 1200, quotaMonthly: 2000 },
    });
    expect(() => getPlanLimits(db)).toThrow(/limits/);

    seedSettings(db);

    expect(getPlanLimits(db)).toEqual({
      pro: { pageCap: 250, quotaMonthly: 150, aiActionsMonthly: 100 },
      premium: { pageCap: 1200, quotaMonthly: 2000, aiActionsMonthly: 300 },
    });
  });

  it('leaves a corrupt limits row alone rather than guessing', () => {
    setSetting(db, LIMITS_KEY, {
      pro: { pageCap: 0, quotaMonthly: 300 },
      premium: { pageCap: 1000, quotaMonthly: 1000 },
    });
    seedSettings(db);
    // The valid row gets the new field; the corrupt one is left for the
    // validator to reject rather than silently rewritten.
    expect(getSetting(db, LIMITS_KEY)).toEqual({
      pro: { pageCap: 0, quotaMonthly: 300 },
      premium: { pageCap: 1000, quotaMonthly: 1000, aiActionsMonthly: 300 },
    });
    expect(() => getPlanLimits(db)).toThrow(/limits/);

    // Restore valid state for any later reader of the shared database.
    seedSettingsAfterReset();
  });
});

/** Re-seed the shared database's limits to the valid defaults. */
function seedSettingsAfterReset(): void {
  // A fresh seed only fills absent keys, so remove the corrupt row first.
  db.delete(settingsKv).where(eq(settingsKv.key, LIMITS_KEY)).run();
  seedSettings(db);
}
