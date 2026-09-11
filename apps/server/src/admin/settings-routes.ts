import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { AppEnv } from '../index.js';
import { auditLogs, settingsKv } from '../db/schema.js';
import type { AppDatabase } from '../db/database.js';
import {
  getLtcRate,
  getPlanLimits,
  getPlanPrices,
  getSetting,
  getWallets,
  LIMITS_KEY,
  LTC_RATE_KEY,
  parseLtcRate,
  parsePlanLimits,
  parsePlanPrices,
  parseWalletAddresses,
  PRICES_KEY,
  WALLETS_KEY,
} from '../db/settings.js';
import type { PlanLimits, PlanPrices, WalletAddresses } from '../db/schema.js';
import { parseJson } from '../request-body.js';

// ─────────────────────────────────────────────────────────────────────────────
// Admin settings (billing/03): wallets, plan prices, plan limits, and the LTC
// rate — all in settings_kv, editable in-panel so a wallet change needs no
// redeploy. Each key updates (and audit-logs) on its own, so the trail shows
// exactly which setting changed. Validation runs through the same parsers the
// readers use, so a value the panel writes is always a value the app accepts.
// ─────────────────────────────────────────────────────────────────────────────

/** The settings the panel edits, as one view. */
export interface AdminSettingsView {
  wallets: WalletAddresses;
  prices: PlanPrices;
  limits: PlanLimits;
  /** USDT per LTC captured into new Orders; null disables LTC payments. */
  ltcRateUsdt: number | null;
}

export function settingsView(db: AppDatabase): AdminSettingsView {
  return {
    wallets: getWallets(db),
    prices: getPlanPrices(db),
    limits: getPlanLimits(db),
    ltcRateUsdt: getLtcRate(db),
  };
}

/** The panel-facing key (URL segment) for each settings_kv key. */
type SettingKey = 'wallets' | 'prices' | 'limits' | 'ltcRateUsdt';

interface ParsedSetting {
  ok: true;
  value: unknown;
}
interface RejectedSetting {
  ok: false;
  error: string;
}

const VALIDATORS: Record<
  SettingKey,
  (value: unknown) => ParsedSetting | RejectedSetting
> = {
  wallets: (value) => {
    const parsed = parseWalletAddresses(value);
    return parsed
      ? { ok: true, value: parsed }
      : {
          ok: false,
          error:
            'Wallet addresses must be an object with a string address for each payment method (USDT-TRC20, USDT-BEP20, LTC).',
        };
  },
  prices: (value) => {
    const parsed = parsePlanPrices(value);
    return parsed
      ? { ok: true, value: parsed }
      : {
          ok: false,
          error:
            'Plan prices must be an object with a positive monthly amount and per-duration totals for every plan.',
        };
  },
  limits: (value) => {
    const parsed = parsePlanLimits(value);
    return parsed
      ? { ok: true, value: parsed }
      : {
          ok: false,
          error:
            'Plan limits must be an object with a whole-number pageCap and quotaMonthly above zero for every plan.',
        };
  },
  ltcRateUsdt: (value) => {
    if (value === null) return { ok: true, value: null };
    const parsed = parseLtcRate(value);
    return parsed
      ? { ok: true, value: parsed }
      : {
          ok: false,
          error:
            'The LTC rate must be a positive USDT-per-LTC number, or null to disable LTC payments.',
        };
  },
};

const KV_KEYS: Record<SettingKey, string> = {
  wallets: WALLETS_KEY,
  prices: PRICES_KEY,
  limits: LIMITS_KEY,
  ltcRateUsdt: LTC_RATE_KEY,
};

export function settingsRoutes() {
  const app = new Hono<AppEnv>();

  app.get('/', (c) => {
    return c.json({ settings: settingsView(c.var.db) });
  });

  app.put('/:key', async (c) => {
    const key = c.req.param('key');
    const validator = VALIDATORS[key as SettingKey];
    if (!validator) {
      return c.json({ error: 'Unknown setting.' }, 404);
    }

    const parsed = validator(parseJson(await c.req.text()));
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }

    const db = c.var.db;
    const admin = c.var.user;
    if (!admin) return c.json({ error: 'Not signed in.' }, 401);

    const kvKey = KV_KEYS[key as SettingKey];
    const before = getSetting(db, kvKey) ?? null;
    const nowDate = new Date();
    db.transaction((tx) => {
      // settings_kv values are NOT NULL, so "clear" is a delete: the key
      // returns to absent, which the readers treat as the seeded/unset state.
      if (parsed.value === null) {
        tx.delete(settingsKv).where(eq(settingsKv.key, kvKey)).run();
      } else {
        tx.insert(settingsKv)
          .values({ key: kvKey, value: parsed.value, updatedAt: nowDate })
          .onConflictDoUpdate({
            target: settingsKv.key,
            set: { value: parsed.value, updatedAt: nowDate },
          })
          .run();
      }
      tx.insert(auditLogs)
        .values({
          adminUserId: admin.id,
          adminEmail: admin.email,
          action: 'settings.update',
          targetType: 'settings',
          targetId: kvKey,
          before,
          after: parsed.value,
        })
        .run();
    });

    return c.json({ settings: settingsView(db) });
  });

  return app;
}
