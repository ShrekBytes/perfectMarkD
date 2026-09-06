import { eq } from 'drizzle-orm';
import type { AppDatabase } from './database.js';
import {
  DURATION_MONTHS,
  PAYMENT_METHODS,
  PLANS,
  settingsKv,
  type Plan,
  type PlanPrices,
  type WalletAddresses,
} from './schema.js';

export const WALLETS_KEY = 'wallets';
export const PRICES_KEY = 'prices';

const MONTHLY_PRICE_USDT: Record<Plan, number> = { pro: 3, premium: 7 };
const TWELVE_MONTH_MULTIPLIER = 10;

function defaultWalletAddresses(): WalletAddresses {
  // Addresses go into admin settings at Phase 2 (PLAN §Launch checklist);
  // seeded empty so nothing ships pointing at a placeholder wallet.
  return {
    'USDT-TRC20': '',
    'USDT-BEP20': '',
    LTC: '',
  };
}

function defaultPlanPrices(): PlanPrices {
  return Object.fromEntries(
    PLANS.map((plan) => {
      const monthly = MONTHLY_PRICE_USDT[plan];
      const durations = Object.fromEntries(
        DURATION_MONTHS.map((months) => [
          months,
          months === 12 ? TWELVE_MONTH_MULTIPLIER * monthly : months * monthly,
        ]),
      );
      return [plan, { monthly, durations }];
    }),
  ) as PlanPrices;
}

/**
 * Seeds the default settings if (and only if) their keys are absent, so
 * admin-edited values survive restarts. Called on every database open.
 */
export function seedSettings(db: AppDatabase): void {
  db.insert(settingsKv)
    .values([
      { key: WALLETS_KEY, value: defaultWalletAddresses() },
      { key: PRICES_KEY, value: defaultPlanPrices() },
    ])
    .onConflictDoNothing()
    .run();
}

/**
 * Raw setting read — unvalidated JSON. Use the typed accessors below, which
 * validate before handing values to callers.
 */
export function getSetting(db: AppDatabase, key: string): unknown {
  const row = db
    .select({ value: settingsKv.value })
    .from(settingsKv)
    .where(eq(settingsKv.key, key))
    .get();
  return row?.value;
}

export function setSetting<T>(db: AppDatabase, key: string, value: T): void {
  db.insert(settingsKv)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settingsKv.key,
      set: { value, updatedAt: new Date() },
    })
    .run();
}

function isWalletAddresses(value: unknown): value is WalletAddresses {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  return (
    PAYMENT_METHODS.every((method) => typeof record[method] === 'string') &&
    keys.every((key) => (PAYMENT_METHODS as readonly string[]).includes(key))
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isPlanPrices(value: unknown): value is PlanPrices {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return PLANS.every((plan) => {
    const price = record[plan];
    if (typeof price !== 'object' || price === null) return false;
    const { monthly, durations } = price as Record<string, unknown>;
    if (!isFiniteNumber(monthly)) return false;
    if (typeof durations !== 'object' || durations === null) return false;
    const byDuration = durations as Record<string, unknown>;
    return DURATION_MONTHS.every((months) =>
      isFiniteNumber(byDuration[String(months)]),
    );
  });
}

/** Receiving wallet address per payment method (ADR-0005). */
export function getWallets(db: AppDatabase): WalletAddresses {
  const value = getSetting(db, WALLETS_KEY);
  if (!isWalletAddresses(value)) {
    throw new Error(
      'settings_kv: wallets setting is malformed — expected an address string per payment method',
    );
  }
  return value;
}

/** Total USDT per plan and duration option. */
export function getPlanPrices(db: AppDatabase): PlanPrices {
  const value = getSetting(db, PRICES_KEY);
  if (!isPlanPrices(value)) {
    throw new Error(
      'settings_kv: prices setting is malformed — expected monthly and per-duration USDT amounts for every plan',
    );
  }
  return value;
}
